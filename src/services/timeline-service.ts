import {
  SLEEP_LONG_HOURS,
  SLEEP_SHORT_HOURS,
  STEPS_GOAL_MET_RATIO,
  addDaysIST,
  classifyBP,
  istInstant,
  toISTDate,
  todayIST,
  type BPClassification,
} from "@/lib/health-rules";
import { doseDateOfLog, scheduledMinutes } from "@/lib/analytics/adherence";
import { loadSeries, type SeriesKey } from "./analytics-data";
import {
  getPatientProfile,
  type ActivityLogEntry,
  type BPLogEntry,
  type FoodLogEntry,
  type MedicineItem,
  type MedicineLogEntry,
  type SleepLogEntry,
  type WeightLogEntry,
} from "./patient-service";
import { getPatientSettingsOrDefault } from "./settings-service";
import { generateSmartInsightsAndAlerts, type HealthAlert } from "./smart-insights-service";

export type TimelineDomain =
  | "food"
  | "bp"
  | "medicine"
  | "activity"
  | "sleep"
  | "weight"
  | "wellness_score"
  | "insight"
  | "alert"
  | "progress_photo"
  | "goal_change"
  | "settings_change";

export type EventDataSource = "Manual" | "Calculated" | "Estimated" | "Imported";
export type DateScope = "today" | "yesterday" | "7d" | "30d" | "all";

export interface TimelineEvent {
  id: string;
  patient_id: string;
  event_type: TimelineDomain;
  /** ISO instant. For date-only events (`isDateOnly`) this is IST midnight of that day and carries no time-of-day meaning. */
  event_timestamp: string;
  source_record_id: string;
  summary: string;
  metadata?: Record<string, unknown>;

  domain: TimelineDomain;
  title: string;
  titleHi: string;
  /** e.g. "08:20 AM", or "पूरे दिन का" for events that only have a date. */
  displayTime: string;
  /** True when the record has only a date (steps, sleep, alerts), so no clock time may be shown. */
  isDateOnly?: boolean;
  dateStr: string; // YYYY-MM-DD (IST)
  value: string;
  unit?: string;
  statusText?: string;
  statusBadge?: string;
  statusBadgeTone?: "green" | "blue" | "amber" | "red" | "neutral";
  source: EventDataSource;
  calculationStatus?: "Raw" | "Calculated" | "Aggregated";
  confidence?: "High" | "Medium" | "Low";
  detailNote?: string;
  detailNoteHi?: string;
  iconName: string;
  canEdit?: boolean;
  canDelete?: boolean;
}

export type TimelineTimeGroup = "Today" | "Yesterday" | "This Week" | "Older";

export interface TimelineGroup {
  groupKey: TimelineTimeGroup;
  groupLabel: string;
  groupLabelHi: string;
  events: TimelineEvent[];
}

export interface TimelineResult {
  groups: TimelineGroup[];
  /** Events in the whole window (not just this page). */
  totalCount: number;
  hasMore: boolean;
  /** IST dates (inclusive) the query covered; "all" is the last 365 days. */
  coveredFrom: string;
  coveredTo: string;
}

const ALL_SCOPE_DAYS = 365;
const DATE_ONLY_LABEL_HI = "पूरे दिन का";

function formatTimeIST(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function dateOnlyTimestamp(dateStr: string): string {
  return istInstant(dateStr, "00:00").toISOString();
}

function groupKeyOf(dateStr: string, today: string): TimelineTimeGroup {
  if (dateStr === today) return "Today";
  if (dateStr === addDaysIST(today, -1)) return "Yesterday";
  if (dateStr >= addDaysIST(today, -6)) return "This Week";
  return "Older";
}

function scopeWindow(scope: DateScope, today: string): { start: string; end: string } {
  switch (scope) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const y = addDaysIST(today, -1);
      return { start: y, end: y };
    }
    case "7d":
      return { start: addDaysIST(today, -6), end: today };
    case "30d":
      return { start: addDaysIST(today, -29), end: today };
    default:
      return { start: addDaysIST(today, -(ALL_SCOPE_DAYS - 1)), end: today };
  }
}

function bpTone(c: BPClassification): TimelineEvent["statusBadgeTone"] {
  if (c.exceedsAlert || c.category === "crisis" || (c.category === "low" && c.needsUrgentAttention)) return "red";
  if (c.aboveTarget || c.category === "low") return "amber";
  return "green";
}

function hhmmOrNull(value: string | null | undefined): string | null {
  const m = value ? /^(\d{1,2}):(\d{2})/.exec(value) : null;
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

const GROUP_LABELS: Record<TimelineTimeGroup, { en: string; hi: string }> = {
  Today: { en: "Today", hi: "आज" },
  Yesterday: { en: "Yesterday", hi: "कल (बीता हुआ दिन)" },
  "This Week": { en: "This Week", hi: "इस सप्ताह" },
  Older: { en: "Earlier", hi: "पूर्व के रिकॉर्ड्स" },
};

/**
 * Unified health timeline. Every domain is read for the whole selected window
 * (IST days), events are merged and sorted newest-first, then paged, so
 * `totalCount` and `hasMore` describe the real data.
 */
export async function getHealthTimelineEvents(
  patientId?: string,
  filterDomain: "all" | TimelineDomain = "all",
  dateScope: DateScope = "today",
  offset: number = 0,
  limit: number = 30,
): Promise<TimelineResult> {
  const profile = await getPatientProfile(patientId);
  const pid = patientId || profile.id;
  const today = todayIST();
  const win = scopeWindow(dateScope, today);
  const wants = (d: TimelineDomain) => filterDomain === "all" || filterDomain === d;

  const keys: SeriesKey[] = [];
  if (wants("food")) keys.push("food");
  if (wants("bp")) keys.push("bp");
  if (wants("medicine")) keys.push("medicineLogs", "medicines");
  if (wants("activity")) keys.push("activity");
  if (wants("sleep")) keys.push("sleep");
  if (wants("weight")) keys.push("weight");

  const [settings, series, smartData] = await Promise.all([
    getPatientSettingsOrDefault(pid),
    keys.length > 0 ? loadSeries(pid, win.start, win.end, keys) : Promise.resolve(null),
    (filterDomain === "all" || filterDomain === "insight" || filterDomain === "alert") && win.end === today
      ? generateSmartInsightsAndAlerts(pid).catch(() => null)
      : Promise.resolve(null),
  ]);

  const events: TimelineEvent[] = [];
  const seen = new Set<string>();
  const add = (ev: TimelineEvent) => {
    if (seen.has(ev.id)) return;
    seen.add(ev.id);
    if (ev.dateStr < win.start || ev.dateStr > win.end) return;
    events.push(ev);
  };

  // 1. Food
  series?.food.forEach((f: FoodLogEntry) => {
    const time = f.consumed_at || f.created_at;
    add({
      id: `food-${f.id}`,
      patient_id: pid,
      event_type: "food",
      event_timestamp: time,
      source_record_id: f.id,
      summary: `${f.meal_type}: ${f.food_name} (${f.calories} kcal)`,
      metadata: { meal_type: f.meal_type, quantity: f.quantity, unit: f.unit },
      domain: "food",
      title: f.food_name,
      titleHi: `${f.meal_type}: ${f.food_name}`,
      displayTime: formatTimeIST(time),
      dateStr: toISTDate(time),
      value: `${f.calories || 0} kcal`,
      unit: "kcal",
      statusText: `${f.quantity} ${f.unit || "serving"} · ${f.meal_type}`,
      statusBadge: f.meal_type,
      statusBadgeTone: "amber",
      source: "Manual",
      calculationStatus: "Raw",
      detailNote: f.notes || undefined,
      iconName: "Utensils",
      canEdit: true,
      canDelete: true,
    });
  });

  // 2. Blood pressure (classified against this patient's own lines)
  series?.bp.forEach((b: BPLogEntry) => {
    const time = b.measured_at || b.created_at;
    const cls = classifyBP(b.systolic, b.diastolic, settings.bp_targets);
    add({
      id: `bp-${b.id}`,
      patient_id: pid,
      event_type: "bp",
      event_timestamp: time,
      source_record_id: b.id,
      summary: `BP Reading ${b.systolic}/${b.diastolic} mmHg (${b.reading_type || "Manual"})`,
      metadata: { systolic: b.systolic, diastolic: b.diastolic, pulse: b.pulse, category: cls.category },
      domain: "bp",
      title: "Blood Pressure Reading",
      titleHi: `ब्लड प्रेशर माप (${b.reading_type || "रीडिंग"})`,
      displayTime: formatTimeIST(time),
      dateStr: toISTDate(time),
      value: `${b.systolic}/${b.diastolic} mmHg`,
      unit: "mmHg",
      statusText: `${cls.labelHi}${b.pulse ? ` · नाड़ी (Pulse): ${b.pulse} bpm` : ""}`,
      statusBadge: b.reading_type || "BP",
      statusBadgeTone: bpTone(cls),
      source: "Manual",
      calculationStatus: "Raw",
      confidence: "High",
      detailNote: b.notes || undefined,
      iconName: "HeartPulse",
      canEdit: true,
      canDelete: true,
    });
  });

  // 3. Medicines: every dose in the window (real logs and computed auto-missed)
  if (series && wants("medicine")) {
    const medById = new Map<string, MedicineItem>(series.medicines.map((m) => [m.id, m]));
    series.medicineLogs.forEach((m: MedicineLogEntry) => {
      const med = medById.get(m.medicine_id);
      const sched = med ? scheduledMinutes(med.scheduled_time) : null;
      const doseDate = sched !== null ? doseDateOfLog(m, sched) : toISTDate(m.scheduled_time);
      const scheduledAt =
        med && sched !== null
          ? istInstant(doseDate, med.scheduled_time.slice(0, 5)).toISOString()
          : new Date(m.scheduled_time).toISOString();
      const isVirtual = m.id.startsWith("auto-missed-");
      const took = (m.status === "taken" || m.status === "late") && m.taken_time ? m.taken_time : null;
      const time = took ?? scheduledAt;
      const name = med ? `${med.medicine_name}${med.dose ? ` · ${med.dose}` : ""}` : "दवाई";
      const statusHi =
        m.status === "taken" ? "समय पर ली गई" : m.status === "late" ? "देर से ली गई" : m.status === "missed" ? "छूट गई" : "बाकी";
      add({
        id: `med-${m.id}`,
        patient_id: pid,
        event_type: "medicine",
        event_timestamp: time,
        source_record_id: m.id,
        summary: `${name}: ${m.status.toUpperCase()}`,
        metadata: { status: m.status, scheduled_time: scheduledAt, medicine_id: m.medicine_id },
        domain: "medicine",
        title: name,
        titleHi: `${name}: ${statusHi}`,
        displayTime: formatTimeIST(time),
        dateStr: took ? toISTDate(took) : doseDate,
        value: m.status === "taken" ? "Taken ✓" : m.status === "late" ? "Late ⏳" : m.status === "missed" ? "Missed ✗" : "Pending",
        statusText: took ? `निर्धारित समय ${formatTimeIST(scheduledAt)}` : `निर्धारित समय ${formatTimeIST(scheduledAt)} (दर्ज समय नहीं)`,
        statusBadge: m.status.toUpperCase(),
        statusBadgeTone: m.status === "taken" ? "green" : m.status === "late" ? "amber" : m.status === "missed" ? "red" : "neutral",
        source: isVirtual ? "Calculated" : "Manual",
        calculationStatus: isVirtual ? "Calculated" : "Raw",
        detailNote: isVirtual ? "No entry was made; counted as missed automatically after the time window." : m.notes || undefined,
        detailNoteHi: isVirtual ? "कोई एंट्री नहीं हुई; समय बीतने के बाद अपने आप छूटी गिनी गई।" : undefined,
        iconName: "Pill",
        canEdit: !isVirtual,
        canDelete: !isVirtual,
      });
    });
  }

  // 4. Activity (daily total: a date, not a time)
  series?.activity.forEach((a: ActivityLogEntry) => {
    const met = a.steps >= settings.daily_step_goal * STEPS_GOAL_MET_RATIO;
    add({
      id: `act-${a.id}`,
      patient_id: pid,
      event_type: "activity",
      event_timestamp: dateOnlyTimestamp(a.date),
      source_record_id: a.id,
      summary: `Daily Physical Movement: ${a.steps.toLocaleString("en-IN")} steps`,
      metadata: { steps: a.steps, distance_km: a.distance_km, minutes: a.walking_minutes },
      domain: "activity",
      title: "Daily Steps & Movement",
      titleHi: "दैनिक कदम व शारीरिक गतिविधि",
      displayTime: DATE_ONLY_LABEL_HI,
      isDateOnly: true,
      dateStr: a.date,
      value: `${a.steps.toLocaleString("en-IN")} कदम`,
      unit: "steps",
      statusText: a.distance_km ? `${a.distance_km} km · ${a.walking_minutes || "--"} min walk` : undefined,
      statusBadge: met ? "Goal Met ✓" : "Recorded",
      statusBadgeTone: met ? "green" : "blue",
      source: a.walking_minutes ? "Manual" : "Estimated",
      calculationStatus: a.walking_minutes ? "Raw" : "Calculated",
      confidence: a.walking_minutes ? "High" : "Low",
      iconName: "Activity",
      canEdit: true,
      canDelete: false,
    });
  });

  // 5. Sleep (the wake-up time when it was recorded, else date-only)
  series?.sleep.forEach((s: SleepLogEntry) => {
    const wake = hhmmOrNull(s.wake_time);
    const hours = Number(s.sleep_hours);
    const short = hours < SLEEP_SHORT_HOURS;
    const long = hours > SLEEP_LONG_HOURS;
    const timestamp = wake ? istInstant(s.date, wake).toISOString() : dateOnlyTimestamp(s.date);
    add({
      id: `sleep-${s.id}`,
      patient_id: pid,
      event_type: "sleep",
      event_timestamp: timestamp,
      source_record_id: s.id,
      summary: `Night Sleep: ${s.sleep_hours} hours`,
      metadata: { hours: s.sleep_hours, bedtime: s.bedtime, wake_time: s.wake_time },
      domain: "sleep",
      title: "Sleep Duration",
      titleHi: "रात्रि विश्राम (नींद)",
      displayTime: wake ? formatTimeIST(timestamp) : DATE_ONLY_LABEL_HI,
      isDateOnly: !wake,
      dateStr: s.date,
      value: `${s.sleep_hours} घंटे`,
      unit: "hours",
      statusText: s.bedtime && s.wake_time ? `समय: ${s.bedtime} - ${s.wake_time}` : undefined,
      statusBadge: short ? "Short" : long ? "Long" : hours >= settings.sleep_target_hours ? "Target met" : "Rest Logged",
      statusBadgeTone: short || long ? "amber" : hours >= settings.sleep_target_hours ? "green" : "blue",
      source: "Manual",
      calculationStatus: "Raw",
      confidence: "High",
      detailNote: s.notes || undefined,
      iconName: "Moon",
      canEdit: true,
      canDelete: true,
    });
  });

  // 6. Weight
  series?.weight.forEach((w: WeightLogEntry) => {
    const time = w.measured_at || w.created_at;
    add({
      id: `weight-${w.id}`,
      patient_id: pid,
      event_type: "weight",
      event_timestamp: time,
      source_record_id: w.id,
      summary: `Body Weight: ${w.weight_kg} kg`,
      metadata: { weight_kg: w.weight_kg },
      domain: "weight",
      title: "Body Weight Measurement",
      titleHi: "शारीरिक वजन माप",
      displayTime: formatTimeIST(time),
      dateStr: toISTDate(time),
      value: `${w.weight_kg} kg`,
      unit: "kg",
      statusBadge: "Weight",
      statusBadgeTone: "neutral",
      source: "Manual",
      calculationStatus: "Raw",
      confidence: "High",
      detailNote: w.notes || undefined,
      iconName: "Scale",
      canEdit: true,
      canDelete: true,
    });
  });

  // 7. Active alerts: computed for today, so they have a date and no clock time
  if (filterDomain === "all" || filterDomain === "alert") {
    smartData?.alerts.forEach((al: HealthAlert) => {
      add({
        id: `alert-${al.key}`,
        patient_id: pid,
        event_type: "alert",
        event_timestamp: dateOnlyTimestamp(al.date),
        source_record_id: al.id,
        summary: al.messageHi,
        metadata: { category: al.category, severity: al.severity, urgent: al.isUrgent ?? false },
        domain: "alert",
        title: al.title,
        titleHi: al.titleHi || al.title,
        displayTime: DATE_ONLY_LABEL_HI,
        isDateOnly: true,
        dateStr: al.date,
        value: "",
        statusBadge: al.severity === "IMPORTANT" ? "ज़रूरी" : al.severity === "ATTENTION" ? "ध्यान दें" : "जानकारी",
        statusBadgeTone: al.severity === "IMPORTANT" ? "red" : al.severity === "ATTENTION" ? "amber" : "neutral",
        source: "Calculated",
        calculationStatus: "Aggregated",
        confidence: "High",
        detailNote: al.messageHi,
        iconName: "ShieldAlert",
        canEdit: false,
        canDelete: false,
      });
    });
  }

  events.sort((a, b) => new Date(b.event_timestamp).getTime() - new Date(a.event_timestamp).getTime());

  const totalCount = events.length;
  const page = events.slice(offset, offset + limit);

  const order: TimelineTimeGroup[] = ["Today", "Yesterday", "This Week", "Older"];
  const buckets: Record<TimelineTimeGroup, TimelineEvent[]> = { Today: [], Yesterday: [], "This Week": [], Older: [] };
  page.forEach((ev) => buckets[groupKeyOf(ev.dateStr, today)].push(ev));

  return {
    groups: order
      .filter((k) => buckets[k].length > 0)
      .map((k) => ({
        groupKey: k,
        groupLabel: GROUP_LABELS[k].en,
        groupLabelHi: GROUP_LABELS[k].hi,
        events: buckets[k],
      })),
    totalCount,
    hasMore: offset + limit < totalCount,
    coveredFrom: win.start,
    coveredTo: win.end,
  };
}
