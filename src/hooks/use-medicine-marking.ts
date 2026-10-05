"use client";

/**
 * The one implementation of "load a day's doses and mark them".
 *
 * The dashboard card, the Medicines page and the quick-mark sheet all read and
 * write through this hook, so they cannot disagree about what "taken" means:
 *
 *  - every write goes through patient-service (`logMedicineStatus`,
 *    `deleteMedicineLog`); nothing here touches storage directly;
 *  - the scheduled instant is always `istInstant(dateIST, HH:MM)`, never "now",
 *    so a dose marked at 01:00 IST still belongs to the right day;
 *  - a dose's state is derived (taken / late / missed / pending / upcoming) from
 *    the stored row plus the clock, using the shared thresholds in
 *    health-rules; virtual auto-missed rows from the service are ignored and the
 *    same rule is re-applied locally so a dose rolls over to "missed" without a
 *    reload;
 *  - updates are optimistic with rollback and a toast either way;
 *  - read-only members (viewers) can look but never write.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { doseDateOfLog, scheduledMinutes } from "@/lib/analytics/adherence";
import {
  MEDICINE_MISSED_AFTER_MIN,
  addDaysIST,
  adherencePct,
  istInstant,
  toISTDate,
  todayIST,
  type DoseStatus,
} from "@/lib/health-rules";
import { hhmm, type DoseState } from "@/lib/medicine-format";
import {
  deleteMedicineLog,
  evaluateMedicineStatusAndMessage,
  getMedicineLogsInRange,
  getMedicines,
  isAutoMissedLogId,
  logMedicineStatus,
  type MedicineItem,
  type MedicineLogEntry,
} from "@/services/patient-service";

export type Dose = {
  medicine: MedicineItem;
  state: DoseState;
  /** The stored row for this dose, if the user has recorded anything. */
  log: MedicineLogEntry | null;
  scheduledAt: Date;
  /** "08:30" */
  scheduledHHMM: string;
  /** When the dose was marked (taken time, else when the row was written). */
  recordedAt: string | null;
  /** Missed only because the deadline passed with nothing recorded (not tapped by a person). */
  autoMissed: boolean;
  /** Minutes past the schedule right now (0 before it is due, or on any other day than today). */
  overdueMin: number;
  /** Recording it as taken right now would be stored as "late" (today only, same rule the save uses). */
  lateIfTakenNow: boolean;
  /** A write for this dose is in flight. */
  busy: boolean;
};

export type DoseSummary = {
  total: number;
  /** taken on time */
  taken: number;
  late: number;
  missed: number;
  pending: number;
  upcoming: number;
  /** taken + late: the doses the patient actually took. */
  done: number;
  /** Share of doses already due that were taken (null until one is due). */
  adherence: number | null;
};

type Snapshot = {
  key: string;
  medicines: MedicineItem[];
  logs: MedicineLogEntry[];
  error: boolean;
};

type Options = {
  /** Called after any successful write, so a parent can refresh its own numbers. */
  onChange?: () => void;
};

// Other hook instances for the same patient (dashboard card + quick-mark sheet
// are mounted together) re-read after a write instead of drifting apart.
type Listener = (patientId: string, source: symbol) => void;
const listeners = new Set<Listener>();
const EXTERNAL = Symbol("external-change");

/** Tell every mounted marking hook for this patient to re-read (after a medicine is added, edited or removed). */
export function notifyMedicinesChanged(patientId: string): void {
  listeners.forEach((l) => l(patientId, EXTERNAL));
}

/** Run `cb` whenever a medicine or a dose changes for this patient (a history view re-reads on it). Returns the unsubscribe. */
export function onMedicinesChanged(patientId: string, cb: () => void): () => void {
  const listener: Listener = (changed) => {
    if (changed === patientId) cb();
  };
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const READ_ONLY_MESSAGE = "आपके पास केवल देखने का एक्सेस है, इसलिए दवाई दर्ज नहीं हो सकती।";

/** A medicine added after the viewed day: its doses that day were never the patient's to take (the adherence maths skips them too). */
function addedAfter(medicine: MedicineItem, dateIST: string): boolean {
  const created = new Date(medicine.created_at);
  return !Number.isNaN(created.getTime()) && toISTDate(created) > dateIST;
}

function withLog(logs: MedicineLogEntry[], medicineId: string, next: MedicineLogEntry | null): MedicineLogEntry[] {
  const rest = logs.filter((l) => l.medicine_id !== medicineId);
  return next ? [...rest, next] : rest;
}

function latestRealLog(logs: MedicineLogEntry[], medicineId: string): MedicineLogEntry | null {
  let best: MedicineLogEntry | null = null;
  for (const l of logs) {
    if (l.medicine_id !== medicineId || isAutoMissedLogId(l.id)) continue;
    if (!best || new Date(l.created_at).getTime() > new Date(best.created_at).getTime()) best = l;
  }
  return best;
}

function deriveDose(medicine: MedicineItem, log: MedicineLogEntry | null, dateIST: string, now: number): Omit<Dose, "busy"> {
  const scheduledHHMM = hhmm(medicine.scheduled_time);
  const scheduledAt = istInstant(dateIST, scheduledHHMM);
  const recordedAt = log ? log.taken_time || log.created_at : null;
  const sched = scheduledAt.getTime();
  const isToday = dateIST === todayIST(new Date(now));
  const overdueMin = isToday ? Math.max(0, Math.floor((now - sched) / 60_000)) : 0;
  const lateIfTakenNow =
    isToday && now >= sched && evaluateMedicineStatusAndMessage(medicine, dateIST, new Date(now).toISOString()).isLate;
  const base = { medicine, log, scheduledAt, scheduledHHMM, overdueMin, lateIfTakenNow };

  if (log && (log.status === "taken" || log.status === "late" || log.status === "missed")) {
    return { ...base, state: log.status, recordedAt, autoMissed: false };
  }

  // Nothing recorded (a stored "pending" row counts as nothing).
  if (now < sched) {
    return { ...base, state: "upcoming", recordedAt: null, autoMissed: false };
  }
  // Same rule the service uses for its virtual rows: a dose scheduled before the
  // medicine was added was never the patient's to take, so it cannot be "missed".
  const existedThen = sched >= new Date(medicine.created_at).getTime();
  const pastDeadline = now > sched + MEDICINE_MISSED_AFTER_MIN * 60_000;
  if (pastDeadline && existedThen) {
    return { ...base, state: "missed", recordedAt: null, autoMissed: true };
  }
  return { ...base, state: "pending", recordedAt: null, autoMissed: false };
}

export function summarizeDoses(doses: Array<{ state: DoseState }>): DoseSummary {
  const count = (s: DoseState) => doses.filter((d) => d.state === s).length;
  const asStatus = (s: DoseState): DoseStatus => (s === "upcoming" ? "pending" : s);
  return {
    total: doses.length,
    taken: count("taken"),
    late: count("late"),
    missed: count("missed"),
    pending: count("pending"),
    upcoming: count("upcoming"),
    done: count("taken") + count("late"),
    adherence: adherencePct(doses.map((d) => ({ status: asStatus(d.state) }))),
  };
}

export function useMedicineMarking(
  patientId: string | null | undefined,
  dateIST: string,
  options: Options = {},
) {
  const { canWrite } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const key = patientId ? `${patientId}|${dateIST}` : "";
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());

  const snapRef = useRef<Snapshot | null>(null);
  const onChangeRef = useRef(options.onChange);
  const source = useRef<symbol>(Symbol("medicine-marking"));
  useEffect(() => {
    snapRef.current = snap;
    onChangeRef.current = options.onChange;
  });

  // Load the day. `snap.key` lagging behind `key` is the loading state, so a
  // date or patient change never needs a synchronous setState in the effect.
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    // Older rows hold the schedule's wall-clock time as if it were UTC, so a late-evening dose of
    // day D sits on D+1 in IST. Read one day further and assign each row to its dose's own day
    // (the same rule the adherence maths uses), so this view and the history never disagree.
    Promise.all([getMedicines(patientId), getMedicineLogsInRange(patientId, dateIST, addDaysIST(dateIST, 1))])
      .then(([medicines, logs]) => {
        if (cancelled) return;
        const minutes = new Map(medicines.map((m) => [m.id, scheduledMinutes(m.scheduled_time)]));
        const ofDay = logs.filter((l) => {
          const min = minutes.get(l.medicine_id);
          return !isAutoMissedLogId(l.id) && min !== undefined && doseDateOfLog(l, min) === dateIST;
        });
        setSnap({ key: `${patientId}|${dateIST}`, medicines, logs: ofDay, error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setSnap({ key: `${patientId}|${dateIST}`, medicines: [], logs: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, dateIST, reloadTick]);

  useEffect(() => {
    if (!patientId) return;
    const listener: Listener = (changedPatientId, from) => {
      if (changedPatientId === patientId && from !== source.current) setReloadTick((t) => t + 1);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [patientId]);

  // Roll "due" over to "missed" (and "later" to "due") without a reload.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const current = snap && snap.key === key ? snap : null;
  const loading = Boolean(key) && current === null;
  const error = current?.error ?? false;

  const doses: Dose[] = useMemo(() => {
    if (!current || current.error) return [];
    return current.medicines
      .filter((m) => m.active && !addedAfter(m, dateIST))
      .map((m) => ({ ...deriveDose(m, latestRealLog(current.logs, m.id), dateIST, now), busy: busyIds.has(m.id) }))
      .sort((a, b) => a.scheduledHHMM.localeCompare(b.scheduledHHMM) || a.medicine.medicine_name.localeCompare(b.medicine.medicine_name));
  }, [current, dateIST, now, busyIds]);

  const summary = useMemo(() => summarizeDoses(doses), [doses]);
  /** Active medicines that did not exist yet on the viewed day (so are not listed). */
  const notYetAdded = useMemo(
    () => (current ? current.medicines.filter((m) => m.active && addedAfter(m, dateIST)).length : 0),
    [current, dateIST],
  );

  const reload = useCallback(() => {
    setSnap(null);
    setReloadTick((t) => t + 1);
  }, []);

  const setBusy = useCallback((ids: string[], busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (busy ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  const patchLog = useCallback(
    (medicineId: string, next: MedicineLogEntry | null) => {
      setSnap((prev) => (prev && prev.key === key ? { ...prev, logs: withLog(prev.logs, medicineId, next) } : prev));
    },
    [key],
  );

  const afterWrite = useCallback(() => {
    if (patientId) listeners.forEach((l) => l(patientId, source.current));
    onChangeRef.current?.();
  }, [patientId]);

  /** False (with a toast) when this member may not write, or the day is not open for marking. */
  const canMark = useCallback((): boolean => {
    if (!patientId) return false;
    if (!canWrite) {
      toast.error("दवाई दर्ज नहीं हो सकती", READ_ONLY_MESSAGE);
      return false;
    }
    if (dateIST > todayIST()) {
      toast.error("आने वाले दिन की दवाई अभी दर्ज नहीं हो सकती");
      return false;
    }
    return true;
  }, [canWrite, dateIST, patientId, toast]);

  /** Write one dose; optimistic, rolled back if the save fails. Returns the saved status, or null. */
  const writeDose = useCallback(
    async (
      medicine: MedicineItem,
      status: "taken" | "late" | "missed",
      takenAt: Date | null,
      notes: string | null,
    ): Promise<MedicineLogEntry | null> => {
      if (!patientId) return null;
      const previous = snapRef.current && snapRef.current.key === key ? latestRealLog(snapRef.current.logs, medicine.id) : null;
      const scheduled = istInstant(dateIST, hhmm(medicine.scheduled_time));

      patchLog(medicine.id, {
        id: `optimistic-${medicine.id}`,
        medicine_id: medicine.id,
        patient_id: patientId,
        scheduled_time: scheduled.toISOString(),
        taken_time: takenAt ? takenAt.toISOString() : null,
        status,
        notes,
        created_at: new Date().toISOString(),
      });
      setBusy([medicine.id], true);
      try {
        const saved = await logMedicineStatus({
          medicine_id: medicine.id,
          patient_id: patientId,
          scheduled_time: scheduled.toISOString(),
          taken_time: takenAt ? takenAt.toISOString() : null,
          status,
          notes,
        });
        patchLog(medicine.id, saved);
        return saved;
      } catch {
        patchLog(medicine.id, previous);
        return null;
      } finally {
        setBusy([medicine.id], false);
      }
    },
    [dateIST, key, patchLog, patientId, setBusy],
  );

  /** How a "taken" tap is recorded: late-or-on-time from the clock for today, plainly "taken" for a back-filled day. */
  const evaluateTaken = useCallback(
    (medicine: MedicineItem, at: Date | undefined) => {
      const backfill = dateIST < todayIST();
      const takenAt = at ?? new Date();
      if (backfill && !at) {
        // We cannot know when a past dose was really taken; record that it was,
        // stamped with the moment it was entered.
        return { status: "taken" as const, takenAt, notes: "बाद में दर्ज किया गया (recorded afterwards)", messageHi: null };
      }
      const res = evaluateMedicineStatusAndMessage(medicine, dateIST, takenAt.toISOString());
      return {
        status: res.computedStatus === "missed" ? ("taken" as const) : res.computedStatus,
        takenAt,
        notes: res.isLate ? "Auto-Late Evaluation: taken past the schedule window" : null,
        messageHi: res.isLate ? res.userMessageHi : null,
      };
    },
    [dateIST],
  );

  const markTaken = useCallback(
    async (medicineId: string, atInstant?: Date): Promise<boolean> => {
      if (!canMark()) return false;
      const medicine = snapRef.current?.medicines.find((m) => m.id === medicineId);
      if (!medicine) return false;

      const res = evaluateTaken(medicine, atInstant);
      const saved = await writeDose(medicine, res.status, res.takenAt, res.notes);
      if (!saved) {
        toast.error("दवाई सेव नहीं हो पाई", "इंटरनेट जाँचकर दोबारा कोशिश करें।");
        return false;
      }
      toast.success(
        `${medicine.medicine_name} — ${res.status === "late" ? "देर से ली गई" : "ली गई"} दर्ज`,
        res.messageHi ?? undefined,
      );
      afterWrite();
      return true;
    },
    [afterWrite, canMark, evaluateTaken, toast, writeDose],
  );

  const markMissed = useCallback(
    async (medicineId: string): Promise<boolean> => {
      if (!canMark()) return false;
      const medicine = snapRef.current?.medicines.find((m) => m.id === medicineId);
      if (!medicine) return false;

      const saved = await writeDose(medicine, "missed", null, "User marked missed");
      if (!saved) {
        toast.error("दवाई सेव नहीं हो पाई", "इंटरनेट जाँचकर दोबारा कोशिश करें।");
        return false;
      }
      toast.info(`${medicine.medicine_name} — छूटी हुई दर्ज`);
      afterWrite();
      return true;
    },
    [afterWrite, canMark, toast, writeDose],
  );

  /** Remove the recorded entry so the dose goes back to "due" / "later". */
  const undo = useCallback(
    async (medicineId: string): Promise<boolean> => {
      if (!canMark()) return false;
      const snapshot = snapRef.current;
      if (!snapshot || snapshot.key !== key) return false;
      const medicine = snapshot.medicines.find((m) => m.id === medicineId);
      const existing = latestRealLog(snapshot.logs, medicineId);
      if (!medicine || !existing) return false;

      patchLog(medicineId, null);
      setBusy([medicineId], true);
      try {
        await deleteMedicineLog(existing.id);
        toast.info(`${medicine.medicine_name} — एंट्री हटाई गई`);
        afterWrite();
        return true;
      } catch {
        patchLog(medicineId, existing);
        toast.error("एंट्री हट नहीं पाई", "दोबारा कोशिश करें।");
        return false;
      } finally {
        setBusy([medicineId], false);
      }
    },
    [afterWrite, canMark, key, patchLog, setBusy, toast],
  );

  /** Doses a "mark all" would record: due now (not later today) and not already taken. */
  const markAllCandidates = useMemo(
    () => doses.filter((d) => d.state === "pending" || d.state === "missed"),
    [doses],
  );

  const markAllTaken = useCallback(async (): Promise<boolean> => {
    if (!canMark()) return false;
    let targets = markAllCandidates;

    // A "missed" a person tapped is a deliberate record; never overwrite it silently.
    const deliberate = targets.filter((d) => d.log?.status === "missed");
    if (deliberate.length > 0) {
      const names = deliberate.map((d) => d.medicine.medicine_name).join(", ");
      const overwrite = await confirm({
        title: "छूटी हुई दवाइयाँ भी 'ली गई' करें?",
        message: `आपने ${names} को 'छूटी' दर्ज किया था। क्या इन्हें भी 'ली गई' कर दें? 'नहीं' चुनने पर ये जैसी हैं वैसी रहेंगी और बाकी दवाइयाँ दर्ज होंगी।`,
        confirmLabel: "हाँ, ये भी ली गईं",
        cancelLabel: "नहीं, ये रहने दें",
      });
      if (!overwrite) targets = targets.filter((d) => d.log?.status !== "missed");
    }

    if (targets.length === 0) {
      toast.info("दर्ज करने के लिए कोई बाकी दवाई नहीं है");
      return false;
    }

    const at = new Date();
    const results = await Promise.all(
      targets.map(async (d) => {
        const res = evaluateTaken(d.medicine, undefined);
        const saved = await writeDose(d.medicine, res.status, at, res.notes ?? "एक साथ दर्ज (marked together)");
        return saved !== null;
      }),
    );
    const ok = results.filter(Boolean).length;
    const failed = results.length - ok;
    if (ok > 0) {
      toast.success(`${ok} दवाइयाँ ली गईं दर्ज हो गईं`);
      afterWrite();
    }
    if (failed > 0) toast.error(`${failed} दवाइयाँ सेव नहीं हो पाईं`, "दोबारा कोशिश करें।");
    return failed === 0;
  }, [afterWrite, canMark, confirm, evaluateTaken, markAllCandidates, toast, writeDose]);

  /** Delete every recorded entry for the day. Always behind a confirmation. */
  const resetDay = useCallback(async (): Promise<boolean> => {
    if (!canMark()) return false;
    const snapshot = snapRef.current;
    if (!snapshot || snapshot.key !== key || snapshot.logs.length === 0) {
      toast.info("इस दिन की कोई एंट्री नहीं है");
      return false;
    }
    const entries = snapshot.logs;
    const label = dateIST === todayIST() ? "आज" : dateIST;
    const sure = await confirm({
      title: `${label} की सभी दवाई एंट्री हटाएँ?`,
      message: `${entries.length} दर्ज एंट्री हट जाएँगी और दवाइयाँ फिर से 'बाकी' दिखेंगी। यह वापस नहीं हो सकता।`,
      confirmLabel: "हाँ, हटाएँ",
      cancelLabel: "रहने दें",
      tone: "danger",
    });
    if (!sure) return false;

    const ids = entries.map((l) => l.medicine_id);
    setSnap((prev) => (prev && prev.key === key ? { ...prev, logs: [] } : prev));
    setBusy(ids, true);
    const results = await Promise.allSettled(entries.map((l) => deleteMedicineLog(l.id)));
    setBusy(ids, false);

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      toast.error("कुछ एंट्री हट नहीं पाईं", "सूची फिर से लोड की जा रही है।");
      reload();
    } else {
      toast.info("सभी एंट्री हटा दी गईं");
    }
    afterWrite();
    return failed === 0;
  }, [afterWrite, canMark, confirm, dateIST, key, reload, setBusy, toast]);

  return {
    /** Active medicines for the day, earliest first, each with its derived state. */
    doses,
    summary,
    /** Every medicine, active or not (for management screens). */
    medicines: current?.medicines ?? [],
    notYetAdded,
    loading,
    error,
    reload,
    canWrite,
    markTaken,
    markMissed,
    undo,
    markAllTaken,
    markAllCandidates,
    resetDay,
  };
}
