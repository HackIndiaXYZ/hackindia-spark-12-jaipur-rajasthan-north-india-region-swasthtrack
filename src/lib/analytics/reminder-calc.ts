/**
 * Which medicine reminders are due right now (pure).
 *
 * Minutes are IST minutes of day. A dose is reminded once at its scheduled time
 * and once more MEDICINE_REMINDER_REPEAT_MIN later if it is still not logged;
 * reminders stop when it is taken / late / skipped, and stop altogether once the
 * dose is past the "late" window (the app shows it as overdue instead). A reminder
 * is judged against the time elapsed since the schedule, not the clock hour, so a
 * 08:55 dose still gets its reminder at 09:05 and 07:50 never matches 08:00.
 */
import { MEDICINE_LATE_AFTER_MIN, MEDICINE_REMINDER_REPEAT_MIN } from "../health-rules";
import { doseDateOfLog, scheduledMinutes, type MedicineLike, type MedicineLogLike } from "./adherence";

export type ReminderStage = 1 | 2;

export interface DueReminder {
  medicineId: string;
  stage: ReminderStage;
}

/** Statuses that mean the person dealt with the dose. "missed" and "pending" do not silence a reminder. */
const RESOLVED = new Set(["taken", "late", "skipped"]);

export function planMedicineReminders(input: {
  medicines: MedicineLike[];
  /** Real (persisted) logs; virtual auto-missed entries must not be passed. */
  logs: MedicineLogLike[];
  nowMinutes: number;
  today: string;
  /** Highest stage already shown today, per medicine id. */
  sent: Record<string, number>;
}): DueReminder[] {
  const out: DueReminder[] = [];
  for (const med of input.medicines) {
    if (!med.active) continue;
    const at = scheduledMinutes(med.scheduled_time);
    const elapsed = input.nowMinutes - at;
    if (elapsed < 0 || elapsed > MEDICINE_LATE_AFTER_MIN) continue;

    const resolved = input.logs.some(
      (l) => l.medicine_id === med.id && doseDateOfLog(l, at) === input.today && RESOLVED.has(l.status),
    );
    if (resolved) continue;

    const stage: ReminderStage = elapsed >= MEDICINE_REMINDER_REPEAT_MIN ? 2 : 1;
    if ((input.sent[med.id] ?? 0) >= stage) continue;
    out.push({ medicineId: med.id, stage });
  }
  return out;
}
