/**
 * Medicine adherence maths, shared by wellness, caregiver, reports, baseline and
 * what-changed so "adherence" is computed exactly once.
 *
 * A dose is one (active medicine, IST date). It is judged against the medicine's
 * own schedule: not-yet-due doses are ignored, taken + late count as adherent
 * (`isAdherent`), a dose with no log past MEDICINE_MISSED_AFTER_MIN is missed,
 * and a due dose still inside that window is "pending" (not counted against).
 */
import {
  MEDICINE_MISSED_AFTER_MIN,
  MISSED_DOSE_CLUSTER_COUNT,
  MISSED_DOSE_CLUSTER_DAYS,
  addDaysIST,
  adherencePct,
  eachIST,
  isAdherent,
  istInstant,
  istMinutesOfDay,
  toISTDate,
  type DoseStatus,
} from "../health-rules";

export interface MedicineLike {
  id: string;
  medicine_name: string;
  /** "HH:MM" or "HH:MM:SS". */
  scheduled_time: string;
  active: boolean;
  created_at?: string | null;
}

export interface MedicineLogLike {
  id?: string;
  medicine_id: string;
  scheduled_time: string;
  taken_time?: string | null;
  status: string;
  created_at?: string | null;
}

export interface DoseRecord {
  medicineId: string;
  name: string;
  /** IST calendar date of the dose. */
  date: string;
  /** Scheduled minute of day (IST). */
  scheduledMin: number;
  status: DoseStatus;
  /** A real (persisted) log exists for this dose. */
  hasRealLog: boolean;
  takenAt: string | null;
}

export interface AdherenceSummary {
  /** Doses that were due by now (taken + late + missed + pending). */
  due: number;
  taken: number;
  late: number;
  missed: number;
  pending: number;
  /** taken + late. */
  adherent: number;
  /** Doses that count toward the percentage (due minus pending). */
  evaluated: number;
  /** null when nothing has been evaluated yet. */
  pct: number | null;
}

export function scheduledMinutes(hhmm: string | null | undefined): number {
  if (!hhmm) return 8 * 60;
  const [h, m] = hhmm.split(":");
  const hh = Number(h);
  const mm = Number(m ?? 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 8 * 60;
  return hh * 60 + mm;
}

function hhmmOf(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * IST date a log belongs to. The app has stored `${date}T${HH:MM}` without a zone,
 * which Postgres reads as UTC, so older rows hold the wall-clock time in UTC.
 * Newer rows hold the true IST instant. We tell them apart by which reading of
 * the instant reproduces the medicine's own HH:MM.
 */
export function doseDateOfLog(log: Pick<MedicineLogLike, "scheduled_time">, scheduledMin: number): string {
  const t = new Date(log.scheduled_time);
  if (Number.isNaN(t.getTime())) return log.scheduled_time.slice(0, 10);
  const utcMin = t.getUTCHours() * 60 + t.getUTCMinutes();
  if (istMinutesOfDay(t) === scheduledMin) return toISTDate(t);
  if (utcMin === scheduledMin) return t.toISOString().slice(0, 10);
  return toISTDate(t);
}

export function effectiveStatus(rawStatus: string, scheduledAtMs: number, nowMs: number): DoseStatus {
  switch (rawStatus) {
    case "taken":
      return "taken";
    case "late":
      return "late";
    case "missed":
    case "skipped":
      return "missed";
    default:
      return nowMs >= scheduledAtMs + MEDICINE_MISSED_AFTER_MIN * 60_000 ? "missed" : "pending";
  }
}

function logRank(l: MedicineLogLike): number {
  const t = l.created_at ? new Date(l.created_at).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * One DoseRecord per due (medicine, date) in [startDate, endDate].
 * `logs` may include virtual `auto-missed-*` entries; they are treated as "no
 * real log" so completeness is not overstated.
 */
export function buildDoseRecords(
  medicines: MedicineLike[],
  logs: MedicineLogLike[],
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): DoseRecord[] {
  const nowMs = now.getTime();
  const medMinutes = new Map(medicines.map((m) => [m.id, scheduledMinutes(m.scheduled_time)]));

  const byKey = new Map<string, MedicineLogLike>();
  for (const log of logs) {
    const min = medMinutes.get(log.medicine_id);
    if (min === undefined) continue;
    const key = `${log.medicine_id}|${doseDateOfLog(log, min)}`;
    const prev = byKey.get(key);
    // A real log always beats a virtual one; between real logs the newest wins.
    const weight = (l: MedicineLogLike) => (l.id?.startsWith("auto-missed-") ? 0 : 1);
    if (!prev || weight(log) > weight(prev) || (weight(log) === weight(prev) && logRank(log) >= logRank(prev))) {
      byKey.set(key, log);
    }
  }

  const out: DoseRecord[] = [];
  const dates = startDate <= endDate ? eachIST(startDate, endDate) : [];
  for (const med of medicines) {
    if (!med.active) continue;
    const min = medMinutes.get(med.id)!;
    const createdMs = med.created_at ? new Date(med.created_at).getTime() : null;
    const createdDate = createdMs !== null && !Number.isNaN(createdMs) ? toISTDate(createdMs) : null;

    for (const date of dates) {
      if (createdDate && date < createdDate) continue;
      const scheduledAt = istInstant(date, hhmmOf(min)).getTime();
      const log = byKey.get(`${med.id}|${date}`);
      const realLog = log && !(log.id?.startsWith("auto-missed-") ?? false) ? log : undefined;

      if (realLog) {
        out.push({
          medicineId: med.id,
          name: med.medicine_name,
          date,
          scheduledMin: min,
          status: effectiveStatus(realLog.status, scheduledAt, nowMs),
          hasRealLog: true,
          takenAt: realLog.taken_time ?? null,
        });
        continue;
      }
      if (nowMs < scheduledAt) continue; // not due yet
      // Added after this dose's time on its first day: it was never due.
      if (createdMs !== null && date === createdDate && scheduledAt < createdMs) continue;
      out.push({
        medicineId: med.id,
        name: med.medicine_name,
        date,
        scheduledMin: min,
        status: nowMs >= scheduledAt + MEDICINE_MISSED_AFTER_MIN * 60_000 ? "missed" : "pending",
        hasRealLog: false,
        takenAt: null,
      });
    }
  }
  return out.sort((a, b) => (a.date === b.date ? a.scheduledMin - b.scheduledMin : a.date < b.date ? -1 : 1));
}

export function summarizeAdherence(doses: Array<Pick<DoseRecord, "status">>): AdherenceSummary {
  const count = (s: DoseStatus) => doses.filter((d) => d.status === s).length;
  const taken = count("taken");
  const late = count("late");
  const missed = count("missed");
  const pending = count("pending");
  const adherent = doses.filter((d) => isAdherent(d.status)).length;
  return {
    due: doses.length,
    taken,
    late,
    missed,
    pending,
    adherent,
    evaluated: doses.length - pending,
    pct: adherencePct(doses),
  };
}

/** Missed doses inside the last MISSED_DOSE_CLUSTER_DAYS days (ending `endDate`). */
export function missedDoseCluster(
  doses: DoseRecord[],
  endDate: string,
): { count: number; isCluster: boolean; medicines: string[] } {
  const start = addDaysIST(endDate, -(MISSED_DOSE_CLUSTER_DAYS - 1));
  const missed = doses.filter((d) => d.status === "missed" && d.date >= start && d.date <= endDate);
  return {
    count: missed.length,
    isCluster: missed.length >= MISSED_DOSE_CLUSTER_COUNT,
    medicines: [...new Set(missed.map((d) => d.name))],
  };
}

/** Doses that are due and still unlogged more than `graceMin` after their time (today only). */
export function overduePendingDoses(doses: DoseRecord[], nowMinutes: number, today: string, graceMin: number): DoseRecord[] {
  return doses.filter(
    (d) => d.date === today && d.status === "pending" && nowMinutes >= d.scheduledMin + graceMin,
  );
}

/** One IST day's doses, summarised (the history chart's bar). */
export interface DayAdherence extends AdherenceSummary {
  date: string;
}

/** One row per IST date in [startDate, endDate] (zero-filled when nothing was due), oldest first. */
export function summarizeByDate(doses: DoseRecord[], startDate: string, endDate: string): DayAdherence[] {
  const byDate = new Map<string, DoseRecord[]>();
  for (const d of doses) {
    const list = byDate.get(d.date);
    if (list) list.push(d);
    else byDate.set(d.date, [d]);
  }
  return eachIST(startDate, endDate).map((date) => ({ date, ...summarizeAdherence(byDate.get(date) ?? []) }));
}

/** Adherence per medicine over the window, in schedule order. */
export function summarizeByMedicine(
  doses: DoseRecord[],
): Array<AdherenceSummary & { medicineId: string; name: string; scheduledMin: number; days: Array<{ date: string; status: DoseStatus }> }> {
  const byMed = new Map<string, DoseRecord[]>();
  for (const d of doses) {
    const list = byMed.get(d.medicineId);
    if (list) list.push(d);
    else byMed.set(d.medicineId, [d]);
  }
  return [...byMed.values()]
    .map((list) => ({
      ...summarizeAdherence(list),
      medicineId: list[0].medicineId,
      name: list[0].name,
      scheduledMin: list[0].scheduledMin,
      days: list.map((d) => ({ date: d.date, status: d.status })),
    }))
    .sort((a, b) => a.scheduledMin - b.scheduledMin || a.name.localeCompare(b.name));
}
