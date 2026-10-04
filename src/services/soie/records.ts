/**
 * Raw rows -> typed, ref-stamped records -> PatientContext. PURE.
 *
 * context.ts does the IO (Supabase, pagination) and hands the raw rows here;
 * the eval fixtures build synthetic raw rows and call the same functions, so
 * the tests exercise the real normalisation (IST days, doses, refs).
 */

import {
  DEFAULT_STEP_GOAL,
  DEFAULT_SLEEP_TARGET,
  MEDICINE_MISSED_AFTER_MIN,
  addDaysIST,
  classifyBP,
  isPlausibleBP,
  istInstant,
  istMinutesOfDay,
  istRangeBounds,
  resolveBPThresholds,
  toISTDate,
  todayIST,
  type BPThresholds,
} from "@/lib/health-rules";
import { medicineSlug } from "./ledger";
import { neutraliseInjection } from "./safety";
import { sanitizeText } from "./normalize";
import {
  MEMORY_KINDS,
  type ActivityRecord,
  type BPRecord,
  type ConditionInfo,
  type DoseRecord,
  type DoseStatus,
  type FoodRecord,
  type MedicineInfo,
  type MemoryItem,
  type MemoryKind,
  type Metric,
  type PatientContext,
  type SleepRecord,
  type WeightRecord,
} from "./types";

// ---------------------------------------------------------------------------
// Raw row shapes (what PostgREST returns)
// ---------------------------------------------------------------------------

export interface BPRow {
  systolic: number;
  diastolic: number;
  pulse: number | null;
  reading_type: string | null;
  measured_at: string;
  notes: string | null;
}
export interface WeightRow {
  weight_kg: number;
  measured_at: string;
  notes: string | null;
}
export interface FoodRow {
  meal_type: string;
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  sodium_mg: number | null;
  consumed_at: string;
}
export interface SleepRow {
  date: string;
  sleep_hours: number;
  bedtime: string | null;
  wake_time: string | null;
}
export interface ActivityRow {
  date: string;
  steps: number;
  distance_km: number;
  walking_minutes: number;
  estimated_calories_burned: number;
}
export interface MedicineRow {
  id: string;
  medicine_name: string;
  dose: string;
  scheduled_time: string;
  meal_relation: string | null;
  frequency: string | null;
  active: boolean;
  created_at: string;
}
export interface MedicineLogRow {
  id?: string;
  medicine_id: string;
  scheduled_time: string;
  taken_time: string | null;
  status: DoseStatus;
}
export interface ConditionRow {
  condition_name: string;
  diagnosed_year: number | null;
  notes: string | null;
}
export interface MemoryRow {
  id: string;
  kind: string;
  content: string;
  created_at: string;
}

export interface RawPatientData {
  patientId: string;
  now: Date;
  days: number;
  patient: {
    age: number | null;
    gender: string | null;
    height_cm: number | null;
    current_weight_kg: number | null;
    target_weight_kg: number | null;
    daily_calorie_target: number | null;
  } | null;
  settings: {
    daily_calorie_target?: number | null;
    daily_step_goal?: number | null;
    sleep_target_hours?: number | null;
    bp_targets?: Partial<BPThresholds> | null;
  } | null;
  conditions: ConditionRow[];
  medicines: MedicineRow[];
  memories: MemoryRow[];
  bp: BPRow[];
  weight: WeightRow[];
  food: FoodRow[];
  sleep: SleepRow[];
  activity: ActivityRow[];
  medicineLogs: MedicineLogRow[];
  truncated: Partial<Record<Metric, boolean>>;
  feedbackNotes: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Free text is DATA that reaches the model: strip control chars, neutralise injection, bound length. */
export function cleanFreeText(s: string | null | undefined, max = 200): string {
  if (!s) return "";
  return neutraliseInjection(sanitizeText(s)).text.slice(0, max);
}

function istClock(instant: string): string {
  const mins = istMinutesOfDay(instant);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function uniqueRef(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  while (used.has(`${base}#${i}`)) i++;
  const ref = `${base}#${i}`;
  used.add(ref);
  return ref;
}

const byTime = <T extends { at: string }>(a: T, b: T) => new Date(a.at).getTime() - new Date(b.at).getTime();

// ---------------------------------------------------------------------------
// Per-metric record builders
// ---------------------------------------------------------------------------

export function toBPRecords(rows: BPRow[], thresholds: BPThresholds): { records: BPRecord[]; implausible: number } {
  const used = new Set<string>();
  let implausible = 0;
  const records: BPRecord[] = [];
  for (const r of rows) {
    const systolic = num(r.systolic);
    const diastolic = num(r.diastolic);
    const pulse = r.pulse === null || r.pulse === undefined ? null : num(r.pulse);
    if (!isPlausibleBP(systolic, diastolic, pulse)) {
      implausible++;
      continue;
    }
    const date = toISTDate(r.measured_at);
    const time = istClock(r.measured_at);
    records.push({
      ref: "",
      at: new Date(r.measured_at).toISOString(),
      date,
      time,
      systolic,
      diastolic,
      pulse,
      readingType: r.reading_type ? cleanFreeText(r.reading_type, 30) : null,
      notes: r.notes ? cleanFreeText(r.notes) : null,
      category: classifyBP(systolic, diastolic, thresholds).category,
    });
  }
  records.sort(byTime);
  for (const rec of records) rec.ref = uniqueRef(`bp:${rec.date}T${rec.time}`, used);
  return { records, implausible };
}

export function toWeightRecords(rows: WeightRow[]): WeightRecord[] {
  const used = new Set<string>();
  const recs = rows
    .filter((r) => num(r.weight_kg) > 0)
    .map<WeightRecord>((r) => ({
      ref: "",
      at: new Date(r.measured_at).toISOString(),
      date: toISTDate(r.measured_at),
      time: istClock(r.measured_at),
      kg: Math.round(num(r.weight_kg) * 100) / 100,
      notes: r.notes ? cleanFreeText(r.notes) : null,
    }))
    .sort(byTime);
  for (const r of recs) r.ref = uniqueRef(`wt:${r.date}T${r.time}`, used);
  return recs;
}

export function toFoodRecords(rows: FoodRow[]): FoodRecord[] {
  const used = new Set<string>();
  const recs = rows.map<FoodRecord>((r) => ({
    ref: "",
    at: new Date(r.consumed_at).toISOString(),
    date: toISTDate(r.consumed_at),
    time: istClock(r.consumed_at),
    meal: cleanFreeText(r.meal_type, 24) || "meal",
    name: cleanFreeText(r.food_name, 80) || "food",
    quantity: num(r.quantity),
    unit: cleanFreeText(r.unit, 16),
    calories: num(r.calories),
    protein_g: num(r.protein_g),
    carbs_g: num(r.carbs_g),
    fat_g: num(r.fat_g),
    fibre_g: num(r.fibre_g),
    sodium_mg: r.sodium_mg === null || r.sodium_mg === undefined ? null : num(r.sodium_mg),
  }));
  recs.sort(byTime);
  for (const r of recs) r.ref = uniqueRef(`food:${r.date}T${r.time}`, used);
  return recs;
}

export function toSleepRecords(rows: SleepRow[]): SleepRecord[] {
  const used = new Set<string>();
  return rows
    .filter((r) => num(r.sleep_hours) > 0)
    .map<SleepRecord>((r) => ({ ref: "", date: r.date, hours: num(r.sleep_hours), bedtime: r.bedtime, wake: r.wake_time }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ ...r, ref: uniqueRef(`sleep:${r.date}`, used) }));
}

export function toActivityRecords(rows: ActivityRow[]): ActivityRecord[] {
  const used = new Set<string>();
  return rows
    .map<ActivityRecord>((r) => ({
      ref: "",
      date: r.date,
      steps: num(r.steps),
      distance_km: num(r.distance_km),
      walking_minutes: num(r.walking_minutes),
      calories_burned: num(r.estimated_calories_burned),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ ...r, ref: uniqueRef(`steps:${r.date}`, used) }));
}

// ---------------------------------------------------------------------------
// Medicines and expected doses
// ---------------------------------------------------------------------------

export function toMedicineInfo(rows: MedicineRow[]): MedicineInfo[] {
  return rows.map((m) => ({
    id: m.id,
    name: cleanFreeText(m.medicine_name, 60),
    dose: cleanFreeText(m.dose, 40),
    scheduled: (m.scheduled_time ?? "08:00").slice(0, 5),
    mealRelation: m.meal_relation ? cleanFreeText(m.meal_relation, 30) : null,
    frequency: cleanFreeText(m.frequency ?? "", 80),
    active: Boolean(m.active),
    createdDate: toISTDate(m.created_at),
  }));
}

const STATUS_RANK: Record<DoseStatus, number> = { taken: 3, late: 2, missed: 1, pending: 0 };

function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * The IST day a medicine log belongs to. Older app versions wrote the schedule
 * as a naive "YYYY-MM-DDTHH:MM:SS", which Postgres read as UTC. When the IST
 * wall clock does not match the medicine's schedule but the UTC wall clock
 * does, the row is re-aligned to its UTC date and counted in `shifted`.
 */
export function logDay(log: MedicineLogRow, med: MedicineInfo): { date: string; shifted: boolean } {
  const ist = toISTDate(log.scheduled_time);
  const istMin = istMinutesOfDay(log.scheduled_time);
  const target = hhmmToMin(med.scheduled);
  if (Math.abs(istMin - target) <= 1) return { date: ist, shifted: false };
  const d = new Date(log.scheduled_time);
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (Math.abs(utcMin - target) <= 1) return { date: d.toISOString().slice(0, 10), shifted: true };
  return { date: ist, shifted: false };
}

export function buildDoseRecords(opts: {
  medicines: MedicineInfo[];
  logs: MedicineLogRow[];
  from: string;
  to: string;
  now: Date;
}): { doses: DoseRecord[]; shifted: number } {
  const { medicines, logs, from, to, now } = opts;
  const today = todayIST(now);
  const last = to < today ? to : today;
  const used = new Set<string>();
  const out: DoseRecord[] = [];
  let shifted = 0;

  const medById = new Map(medicines.map((m) => [m.id, m]));
  const logsByMedDay = new Map<string, MedicineLogRow[]>();
  const daysWithLogs = new Map<string, Set<string>>();
  for (const l of logs) {
    const med = medById.get(l.medicine_id);
    if (!med) continue;
    const { date, shifted: s } = logDay(l, med);
    if (s) shifted++;
    const key = `${med.id}|${date}`;
    logsByMedDay.set(key, [...(logsByMedDay.get(key) ?? []), l]);
    daysWithLogs.set(med.id, (daysWithLogs.get(med.id) ?? new Set()).add(date));
  }

  for (const med of medicines) {
    const loggedDays = daysWithLogs.get(med.id) ?? new Set<string>();
    let days: string[];
    if (med.active) {
      const earliestLog = loggedDays.size ? Array.from(loggedDays).sort()[0] : med.createdDate;
      const start0 = med.createdDate < earliestLog ? med.createdDate : earliestLog;
      const start = start0 > from ? start0 : from;
      days = [];
      for (let d = start; d <= last; d = addDaysIST(d, 1)) days.push(d);
    } else {
      // Deactivation date is unknown: only days that carry a real log count.
      days = Array.from(loggedDays)
        .filter((d) => d >= from && d <= last)
        .sort();
    }

    for (const date of days) {
      const dayLogs = logsByMedDay.get(`${med.id}|${date}`) ?? [];
      const best = dayLogs.slice().sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status])[0];
      const dueInstant = istInstant(date, med.scheduled).getTime();
      const pastDeadline = now.getTime() > dueInstant + MEDICINE_MISSED_AFTER_MIN * 60_000;
      let status: DoseStatus;
      let source: DoseRecord["source"];
      if (best && best.status !== "pending") {
        status = best.status;
        source = "logged";
      } else if (pastDeadline) {
        status = "missed";
        source = "auto_missed";
      } else {
        status = "pending";
        source = best ? "logged" : "unlogged_pending";
      }
      out.push({
        ref: uniqueRef(`dose:${date}:${medicineSlug(med.name, med.scheduled)}`, used),
        date,
        medicineId: med.id,
        medicineName: med.name,
        dose: med.dose,
        scheduled: med.scheduled,
        status,
        takenAt: best?.taken_time ?? null,
        source,
      });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.scheduled.localeCompare(b.scheduled));
  return { doses: out, shifted };
}

// ---------------------------------------------------------------------------
// Whole context
// ---------------------------------------------------------------------------

function toMemories(rows: MemoryRow[]): MemoryItem[] {
  return rows
    .filter((m) => (MEMORY_KINDS as readonly string[]).includes(m.kind))
    .map((m) => ({ id: m.id, kind: m.kind as MemoryKind, content: cleanFreeText(m.content, 500), createdAt: m.created_at }));
}

function toConditions(rows: ConditionRow[]): ConditionInfo[] {
  return rows.map((c) => ({ name: cleanFreeText(c.condition_name, 80), year: c.diagnosed_year ?? null, notes: c.notes ? cleanFreeText(c.notes, 200) : null }));
}

export function buildContext(raw: RawPatientData): PatientContext {
  const today = todayIST(raw.now);
  const range = istRangeBounds(raw.days, today);
  const thresholds = resolveBPThresholds(raw.settings?.bp_targets ?? null);
  const bp = toBPRecords(raw.bp, thresholds);
  const medicines = toMedicineInfo(raw.medicines);
  const { doses, shifted } = buildDoseRecords({ medicines, logs: raw.medicineLogs, from: range.startDate, to: today, now: raw.now });
  const p = raw.patient;
  return {
    patientId: raw.patientId,
    generatedAt: raw.now.toISOString(),
    today,
    nowTime: istClock(raw.now.toISOString()),
    range: { from: range.startDate, to: today, days: raw.days },
    profile: {
      age: p?.age ?? null,
      gender: p?.gender ?? null,
      heightCm: p?.height_cm ?? null,
      profileWeightKg: p?.current_weight_kg ?? null,
      targetWeightKg: p?.target_weight_kg ?? null,
    },
    goals: {
      calorieTarget: num(raw.settings?.daily_calorie_target ?? p?.daily_calorie_target, 1600) || 1600,
      stepGoal: num(raw.settings?.daily_step_goal, DEFAULT_STEP_GOAL) || DEFAULT_STEP_GOAL,
      sleepTargetHours: num(raw.settings?.sleep_target_hours, DEFAULT_SLEEP_TARGET) || DEFAULT_SLEEP_TARGET,
      bp: thresholds,
    },
    conditions: toConditions(raw.conditions),
    medicines,
    memories: toMemories(raw.memories),
    bp: bp.records,
    weight: toWeightRecords(raw.weight),
    food: toFoodRecords(raw.food),
    sleep: toSleepRecords(raw.sleep),
    activity: toActivityRecords(raw.activity),
    doses,
    truncated: raw.truncated,
    feedbackNotes: raw.feedbackNotes.map((n) => cleanFreeText(n, 200)).filter(Boolean),
    quality: { implausibleBP: bp.implausible, legacyShiftedDoseLogs: shifted },
  };
}
