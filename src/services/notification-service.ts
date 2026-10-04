/**
 * Medicine reminders through the browser Notification API.
 *
 * Limits worth knowing: these notifications are raised by the open page. They work
 * while the tab (or the installed PWA window) is open or recently backgrounded, and
 * not when the app is fully closed: there is no push server behind them.
 */
import { istMinutesOfDay, todayIST } from "@/lib/health-rules";
import { planMedicineReminders, type ReminderStage } from "@/lib/analytics/reminder-calc";
import { getMedicineLogsInRange, getMedicines, type MedicineItem } from "./patient-service";
import { getPatientSettingsOrDefault, isAlertEnabled } from "./settings-service";

export type NotificationStatus = "granted" | "denied" | "default" | "unsupported";

export function getNotificationPermissionStatus(): NotificationStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotificationStatus;
}

export async function requestNotificationPermission(): Promise<NotificationStatus> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    return (await Notification.requestPermission()) as NotificationStatus;
  } catch {
    return "denied";
  }
}

export function sendBrowserNotification(title: string, options?: NotificationOptions): boolean {
  if (getNotificationPermissionStatus() !== "granted") return false;
  try {
    new Notification(title, { icon: "/favicon.png", badge: "/favicon.png", ...options });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Per-day de-duplication (sessionStorage: a reminder is not repeated on reload)
// ---------------------------------------------------------------------------

const sentKey = (patientId: string, date: string) => `swasthtrack_med_reminders_${patientId}_${date}`;

function readSent(patientId: string, date: string): Record<string, number> {
  try {
    const raw = window.sessionStorage.getItem(sentKey(patientId, date));
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeSent(patientId: string, date: string, value: Record<string, number>): void {
  try {
    window.sessionStorage.setItem(sentKey(patientId, date), JSON.stringify(value));
  } catch {
    // Without sessionStorage a reminder may repeat after a reload; harmless.
  }
}

const MEAL_TEXT_HI: Record<string, string> = {
  before_meal: "भोजन से पहले",
  after_meal: "भोजन के बाद",
  with_meal: "भोजन के साथ",
};

function reminderText(med: MedicineItem, stage: ReminderStage): { title: string; body: string } {
  const detail = [med.dose, med.meal_relation ? MEAL_TEXT_HI[med.meal_relation] : null].filter(Boolean).join(" · ");
  return stage === 1
    ? { title: `💊 दवा का समय: ${med.medicine_name}`, body: `${detail ? `${detail} · ` : ""}लेने का समय हो गया है।` }
    : { title: `💊 दवा अभी दर्ज नहीं हुई: ${med.medicine_name}`, body: `${detail ? `${detail} · ` : ""}ली हो तो ऐप में दर्ज कर दें, नहीं तो अभी ले लें।` };
}

/**
 * Raise any reminder that is due now for this patient. Safe to call every minute:
 * each medicine is reminded at most twice a day (at its time, and 30 minutes later
 * if still unlogged), and never once it is taken / late / skipped. Returns the
 * medicines a notification was actually shown for.
 */
export async function checkAndTriggerMedicineReminders(patientId?: string): Promise<MedicineItem[]> {
  if (typeof window === "undefined" || getNotificationPermissionStatus() !== "granted") return [];

  const settings = await getPatientSettingsOrDefault(patientId);
  if (!isAlertEnabled(settings, "medicine")) return [];
  const pid = settings.patient_id || patientId;
  if (!pid) return [];

  const today = todayIST();
  const [medicines, logs] = await Promise.all([getMedicines(pid), getMedicineLogsInRange(pid, today, today)]);

  const sent = readSent(pid, today);
  const due = planMedicineReminders({
    medicines,
    logs: logs.filter((l) => !l.id.startsWith("auto-missed-")),
    nowMinutes: istMinutesOfDay(new Date()),
    today,
    sent,
  });

  const shown: MedicineItem[] = [];
  for (const d of due) {
    const med = medicines.find((m) => m.id === d.medicineId);
    if (!med) continue;
    const { title, body } = reminderText(med, d.stage);
    if (sendBrowserNotification(title, { body, tag: `med-${med.id}-${today}-${d.stage}` })) {
      sent[med.id] = d.stage;
      shown.push(med);
    }
  }
  if (shown.length > 0) writeSent(pid, today, sent);
  return shown;
}
