import { getActivePatientId } from "@/lib/active-patient";
import {
  addDaysIST,
  bpSlotOf,
  classifyBP,
  isPlausibleBP,
  istMinutesOfDay,
  todayIST,
} from "@/lib/health-rules";
import { buildDoseRecords, summarizeAdherence } from "@/lib/analytics/adherence";
import {
  bpAboveLines,
  bpTrendOver,
  buildAttentionItems,
  deriveRoutineStatus,
  eveningGapDays,
  lowSleepNights,
  mean,
  trailingDates,
  usualMedian,
  weightTrendOver,
  type CaregiverAttentionItem,
  type CaregiverAttentionLevel,
  type MonthlyBPTrend,
  type MonthlyWeightTrend,
  type PeriodBP,
  type RoutineStatus,
} from "@/lib/analytics/caregiver-calc";
import { groupByDay } from "@/lib/analytics/dates";
import { bpDay, foodDay, loadSeries, weightDay } from "./analytics-data";
import { detectHealthAnomaliesAndTrends } from "./anomaly-detection-service";
import { filterValidActivityLogs, filterValidBPLogs, filterValidSleepLogs, filterValidWeightLogs } from "./data-quality-service";
import { getPatientProfile } from "./patient-service";
import { getPatientSettingsOrDefault } from "./settings-service";
import { calculateDailyWellnessScore, calculateWellnessScoresForRange } from "./wellness-score-service";
import { getHealthChanges } from "./what-changed-service";

export type { CaregiverAttentionItem, CaregiverAttentionLevel };
export type CaregiverViewMode = "daily" | "weekly" | "monthly";

export interface CaregiverSnapshotVital {
  label: string;
  labelHi: string;
  value: string;
  subtext?: string;
  isLogged: boolean;
  iconName: string;
}

export interface TodayVsUsualComparison {
  metric: string;
  metricHi: string;
  todayValueStr: string;
  usualValueStr: string;
  diffPercent?: number;
  direction: "above" | "below" | "similar";
  comparisonTextHi: string;
  confidence: "High" | "Medium" | "Limited Data";
}

export interface CaregiverDailyBrief {
  patientId: string;
  patientName: string;
  /** Always false now: nothing is keyed to a particular patient id or name. Kept so older UI compiles. */
  isPapa: boolean;
  dateStr: string; // YYYY-MM-DD (IST)
  dateLabelHi: string;
  /** IST time the brief was computed, e.g. "10:32 am". */
  cachedAt: string;
  cacheTimestamp: number;

  naturalLanguageSummaryHi: string;

  routineStatus: RoutineStatus;
  routineStatusHi: "रूटीन ट्रैक पर है" | "ध्यान देने योग्य" | "डेटा अधूरा है";
  /** Wellness score for the day (0 when `isScoreSufficient` is false: show "no data" instead). */
  routineScore: number;
  isScoreSufficient: boolean;
  expectedItemsCount: number;
  recordedItemsCount: number;
  completenessPercent: number;
  completenessLabelHi: string;

  snapshot: {
    bp: CaregiverSnapshotVital;
    medicines: CaregiverSnapshotVital;
    food: CaregiverSnapshotVital;
    activity: CaregiverSnapshotVital;
    sleep: CaregiverSnapshotVital;
    weight: CaregiverSnapshotVital;
  };

  highlights: string[];
  attentionItems: CaregiverAttentionItem[];
  todayVsUsual: TodayVsUsualComparison[];

  whatChangedCompactHi: string;
  /** True only when a compared measure moved (or adherence is low) in a sustained way. */
  hasPersistentChanges: boolean;
}

export interface CaregiverWeeklyBrief {
  patientId: string;
  patientName: string;
  /** IST dates (inclusive). */
  weekStartStr: string;
  weekEndStr: string;
  avgBP: string;
  avgSteps: number;
  avgCalories: number;
  avgSleepHours: number;
  /** null when no dose was due in the window. */
  medAdherencePercent: number | null;
  weightChangeStr: string;
  /** Mean of the daily scores over days that had any data (0 when `routineScoreIsSufficient` is false). */
  routineScore: number;
  routineScoreIsSufficient: boolean;
  dataCompletenessPercent: number;
  topChanges: string[];
  topAttention: string[];
  /** Which averages are backed by data; a 0 above with `false` here means "no data", not zero. */
  hasData: { bp: boolean; steps: boolean; sleep: boolean; calories: boolean; medicines: boolean; weight: boolean };
}

export interface CaregiverMonthlyBrief {
  patientId: string;
  patientName: string;
  monthLabel: string;
  weightTrend: MonthlyWeightTrend;
  bpTrend: MonthlyBPTrend;
  stepsAvg: number;
  sleepAvgHours: number;
  /** null when no dose was due in the window. */
  medAdherencePercent: number | null;
  foodConsistencyPercent: number;
  routineScore: number;
  routineScoreIsSufficient: boolean;
  notableChanges: string[];
  hasData: { bp: boolean; steps: boolean; sleep: boolean; medicines: boolean; weight: boolean };
}

const _inflight = new Map<string, Promise<CaregiverDailyBrief>>();

/** Kept for callers that invalidate after logging; reads are cached (and write-invalidated) in patient-service. */
export function invalidateCaregiverCache(patientId?: string): void {
  if (!patientId) {
    _inflight.clear();
    return;
  }
  for (const key of _inflight.keys()) if (key.startsWith(patientId)) _inflight.delete(key);
}

function resolvePatientId(patientId?: string): string | undefined {
  return patientId || getActivePatientId() || undefined;
}

function formatHumanDateHi(dateStr: string, today: string): string {
  if (dateStr === today) return "आज (Today)";
  if (dateStr === addDaysIST(today, -1)) return "कल (Yesterday)";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("hi-IN", {
    day: "numeric",
    month: "short",
    weekday: "short",
    timeZone: "UTC",
  });
}

function formatNowIST(): string {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

const ROUTINE_HI: Record<RoutineStatus, CaregiverDailyBrief["routineStatusHi"]> = {
  "Routine on track": "रूटीन ट्रैक पर है",
  "Needs attention": "ध्यान देने योग्य",
  "Data incomplete": "डेटा अधूरा है",
};

/**
 * Daily brief: answers "how was today?". Facts come from the same wellness result
 * the dashboard shows, so the two can never disagree.
 */
export function getCaregiverDailyBrief(
  patientId?: string,
  targetDateStr?: string,
  _forceRefresh: boolean = false,
): Promise<CaregiverDailyBrief> {
  void _forceRefresh;
  const key = `${patientId ?? ""}|${targetDateStr ?? ""}`;
  const pending = _inflight.get(key);
  if (pending) return pending;
  const request = computeDailyBrief(resolvePatientId(patientId), targetDateStr).finally(() => {
    _inflight.delete(key);
  });
  _inflight.set(key, request);
  return request;
}

async function computeDailyBrief(patientId: string | undefined, targetDateStr?: string): Promise<CaregiverDailyBrief> {
  const today = todayIST();
  const dateStr = targetDateStr || today;
  const isToday = dateStr === today;
  const nowMinutes = isToday ? istMinutesOfDay(new Date()) : null;

  const profile = await getPatientProfile(patientId);
  const pid = patientId || profile.id;

  const [settings, wellness, series, whatChanged, intelligence] = await Promise.all([
    getPatientSettingsOrDefault(pid),
    calculateDailyWellnessScore(pid, dateStr).catch(() => null),
    loadSeries(pid, addDaysIST(dateStr, -14), dateStr, ["bp", "weight", "food", "sleep", "activity", "medicineLogs", "medicines"]),
    getHealthChanges(pid, "7d").catch(() => null),
    isToday ? detectHealthAnomaliesAndTrends(pid).catch(() => null) : Promise.resolve(null),
  ]);

  const t = settings.bp_targets;
  const bpToday = filterValidBPLogs(series.bp).filter((b) => bpDay(b) === dateStr);
  const plausibleToday = bpToday.filter((b) => isPlausibleBP(b.systolic, b.diastolic, b.pulse));
  const slotOf = (b: (typeof bpToday)[number]) => bpSlotOf(b.reading_type, istMinutesOfDay(b.measured_at));
  const morningBP = plausibleToday.find((b) => slotOf(b) === "morning") ?? null;
  const eveningBP = plausibleToday.find((b) => slotOf(b) === "evening") ?? null;

  const foodToday = series.food.filter((f) => foodDay(f) === dateStr);
  const totalCalories = foodToday.reduce((s, f) => s + Number(f.calories || 0), 0);
  const actToday = filterValidActivityLogs(series.activity).filter((a) => a.date === dateStr).pop() ?? null;
  const sleepToday = filterValidSleepLogs(series.sleep).filter((s) => s.date === dateStr).pop() ?? null;
  const weightRows = filterValidWeightLogs(series.weight);
  const latestWeight = weightRows.length > 0 ? weightRows[weightRows.length - 1] : null;

  const doses = buildDoseRecords(series.medicines, series.medicineLogs, dateStr, dateStr);
  const adherence = summarizeAdherence(doses);
  const activeMedCount = series.medicines.filter((m) => m.active).length;

  const attentionAll = buildAttentionItems({
    today,
    dateStr,
    nowMinutes,
    wellness,
    doses,
    anomalies: intelligence?.anomalies ?? [],
    alerts: settings.alerts_enabled,
  });
  const routineStatus = deriveRoutineStatus({ wellness, isToday, doses, attention: attentionAll });

  const expectedItemsCount = wellness?.itemsExpected ?? 0;
  const recordedItemsCount = wellness?.itemsLogged ?? 0;
  const completenessPercent = expectedItemsCount > 0 ? Math.round((recordedItemsCount / expectedItemsCount) * 100) : 0;

  // ---- snapshot (missing is shown as missing, never as a zero) ----
  const bpValueOf = (b: { systolic: number; diastolic: number }) => `${b.systolic} / ${b.diastolic}`;
  const bpClass = (b: { systolic: number; diastolic: number }) => classifyBP(b.systolic, b.diastolic, t);
  const first = morningBP ?? eveningBP ?? plausibleToday[0] ?? null;
  const snapshot: CaregiverDailyBrief["snapshot"] = {
    bp: {
      label: "Blood Pressure",
      labelHi: "रक्तचाप (BP)",
      value: first ? bpValueOf(first) : "Not logged",
      subtext: first
        ? morningBP && eveningBP
          ? `सुबह: ${morningBP.systolic}/${morningBP.diastolic}, शाम: ${eveningBP.systolic}/${eveningBP.diastolic} · ${bpClass(first).labelHi}`
          : `${plausibleToday.length} माप दर्ज · ${bpClass(first).labelHi}`
        : isToday
          ? "आज दर्ज नहीं हुआ"
          : "इस दिन दर्ज नहीं हुआ",
      isLogged: Boolean(first),
      iconName: "HeartPulse",
    },
    medicines: {
      label: "Medicines",
      labelHi: "दवाइयाँ (Medicines)",
      value:
        adherence.due > 0
          ? `${adherence.adherent} / ${adherence.due}`
          : activeMedCount > 0
            ? "अभी समय नहीं हुआ"
            : "दवाई जोड़ी नहीं गई",
      subtext:
        adherence.due === 0
          ? undefined
          : adherence.adherent === adherence.due
            ? "अब तक की सभी खुराकें ली गईं ✓"
            : [
                adherence.missed > 0 ? `${adherence.missed} छूटीं` : null,
                adherence.pending > 0 ? `${adherence.pending} दर्ज होनी बाकी` : null,
              ]
                .filter(Boolean)
                .join(" · "),
      isLogged: adherence.adherent > 0,
      iconName: "Pill",
    },
    food: {
      label: "Food Intake",
      labelHi: "भोजन (Food)",
      value: foodToday.length > 0 ? `${Math.round(totalCalories).toLocaleString("en-IN")} kcal` : "Not logged",
      subtext: foodToday.length > 0 ? `${foodToday.length} बार दर्ज किया गया` : isToday ? "आज भोजन दर्ज नहीं हुआ" : "इस दिन भोजन दर्ज नहीं हुआ",
      isLogged: foodToday.length > 0,
      iconName: "Utensils",
    },
    activity: {
      label: "Steps",
      labelHi: "दैनिक कदम (Steps)",
      value: actToday && actToday.steps > 0 ? `${actToday.steps.toLocaleString("en-IN")} कदम` : "Not logged",
      subtext: actToday?.distance_km ? `${actToday.distance_km} किमी दूरी` : undefined,
      isLogged: Boolean(actToday && actToday.steps > 0),
      iconName: "Activity",
    },
    sleep: {
      label: "Sleep",
      labelHi: "नींद (Sleep)",
      value: sleepToday ? `${sleepToday.sleep_hours} घंटे` : "Not logged",
      subtext: sleepToday?.bedtime && sleepToday?.wake_time ? `${sleepToday.bedtime} - ${sleepToday.wake_time}` : undefined,
      isLogged: Boolean(sleepToday),
      iconName: "Moon",
    },
    weight: {
      label: "Weight",
      labelHi: "वजन (Weight)",
      value: latestWeight ? `${latestWeight.weight_kg} kg` : "Not logged",
      subtext: latestWeight
        ? weightDay(latestWeight) === dateStr
          ? "आज का माप"
          : `पिछला माप · ${Math.round((Date.parse(dateStr) - Date.parse(weightDay(latestWeight))) / 86_400_000)} दिन पहले`
        : "माप दर्ज नहीं",
      isLogged: Boolean(latestWeight),
      iconName: "Scale",
    },
  };

  // ---- highlights: only things that are true and logged ----
  const highlights: string[] = [];
  if (adherence.due > 0 && adherence.adherent === adherence.due) {
    highlights.push(`अब तक की सभी ${adherence.due} निर्धारित दवाइयाँ दर्ज हुईं।`);
  } else if (adherence.adherent > 0) {
    highlights.push(`${adherence.adherent} खुराकें ली गईं।`);
  }
  if (plausibleToday.length > 0 && plausibleToday.every((b) => !bpClass(b).aboveTarget && bpClass(b).category !== "low")) {
    highlights.push(`आज का BP मरीज़ के लक्ष्य (${t.target_systolic}/${t.target_diastolic}) के भीतर रहा।`);
  }

  // ---- today vs usual: the usual is the 14 days BEFORE the target day ----
  const priorActs = filterValidActivityLogs(series.activity).filter((a) => a.date < dateStr && a.steps > 0).map((a) => a.steps);
  const priorSleep = filterValidSleepLogs(series.sleep).filter((s) => s.date < dateStr && Number(s.sleep_hours) > 0).map((s) => Number(s.sleep_hours));
  const todayVsUsual: TodayVsUsualComparison[] = [];

  const usualSteps = usualMedian(priorActs);
  if (actToday && actToday.steps > 0 && usualSteps) {
    const diffPct = Math.round(((actToday.steps - usualSteps.value) / usualSteps.value) * 100);
    const direction = Math.abs(diffPct) < 8 ? "similar" : diffPct > 0 ? "above" : "below";
    todayVsUsual.push({
      metric: "Steps",
      metricHi: "दैनिक कदम (Steps)",
      todayValueStr: `${actToday.steps.toLocaleString("en-IN")} कदम`,
      usualValueStr: `${Math.round(usualSteps.value).toLocaleString("en-IN")} कदम`,
      diffPercent: diffPct,
      direction,
      comparisonTextHi: direction === "similar" ? "पिछले 2 हफ्तों के सामान्य के बराबर" : `${diffPct > 0 ? "+" : ""}${diffPct}% पिछले 2 हफ्तों की तुलना में`,
      confidence: usualSteps.count >= 7 ? "High" : "Medium",
    });
    if (direction === "above") highlights.push(`कदम (${actToday.steps.toLocaleString("en-IN")}) सामान्य से ज़्यादा रहे।`);
  }
  const usualSleep = usualMedian(priorSleep);
  if (sleepToday && usualSleep) {
    const hours = Number(sleepToday.sleep_hours);
    const diff = Math.round((hours - usualSleep.value) * 10) / 10;
    const direction = Math.abs(diff) < 0.4 ? "similar" : diff > 0 ? "above" : "below";
    todayVsUsual.push({
      metric: "Sleep",
      metricHi: "नींद की अवधि (Sleep)",
      todayValueStr: `${hours} घंटे`,
      usualValueStr: `${usualSleep.value} घंटे`,
      diffPercent: Math.round((diff / usualSleep.value) * 100),
      direction,
      comparisonTextHi: direction === "similar" ? "सामान्य नींद के अनुरूप" : `${diff > 0 ? "+" : ""}${diff} घंटे पिछले 2 हफ्तों के सामान्य से`,
      confidence: usualSleep.count >= 7 ? "High" : "Medium",
    });
  }
  if (wellness?.nutritionContext && wellness.components.food.healthPct !== null && settings.daily_calorie_target) {
    const target = settings.daily_calorie_target;
    const diffPct = Math.round(((wellness.nutritionContext.caloriesConsumed - target) / target) * 100);
    const direction = Math.abs(diffPct) < 10 ? "similar" : diffPct > 0 ? "above" : "below";
    todayVsUsual.push({
      metric: "Calories",
      metricHi: "कैलोरी सेवन (Calories)",
      todayValueStr: `${wellness.nutritionContext.caloriesConsumed.toLocaleString("en-IN")} kcal`,
      usualValueStr: `${target.toLocaleString("en-IN")} kcal (लक्ष्य)`,
      diffPercent: diffPct,
      direction,
      comparisonTextHi: direction === "similar" ? "दैनिक कैलोरी लक्ष्य के पास" : `${diffPct > 0 ? "+" : ""}${diffPct}% दैनिक लक्ष्य से`,
      confidence: "High",
    });
  }

  // ---- natural-language summary (facts only) ----
  const sentences: string[] = [];
  const urgent = attentionAll.find((a) => a.isUrgent);
  if (urgent) sentences.push(urgent.textHi);
  if (adherence.due > 0) {
    if (adherence.adherent === adherence.due) sentences.push(`अब तक की सभी ${adherence.due} निर्धारित दवाइयाँ दर्ज हुईं।`);
    else if (adherence.adherent > 0)
      sentences.push(`${adherence.due} में से ${adherence.adherent} दवाइयाँ दर्ज हुईं${adherence.missed > 0 ? `, ${adherence.missed} छूटीं` : ""}।`);
    else if (adherence.missed > 0) sentences.push(`${adherence.missed} दवाई छूटी हुई है।`);
    else sentences.push("दवाइयों का रिकॉर्ड अभी दर्ज होना बाकी है।");
  }
  if (morningBP && eveningBP) sentences.push("सुबह और शाम दोनों का ब्लड प्रेशर दर्ज है।");
  else if (first) sentences.push(`ब्लड प्रेशर ${bpValueOf(first).replace(" / ", "/")} दर्ज हुआ (${bpClass(first).labelHi})।`);
  else if (wellness?.components.bp.isScored) sentences.push("ब्लड प्रेशर अभी दर्ज नहीं हुआ है।");
  if (sleepToday) sentences.push(`नींद ${sleepToday.sleep_hours} घंटे दर्ज हुई।`);
  if (actToday && actToday.steps > 0) sentences.push(`${actToday.steps.toLocaleString("en-IN")} कदम दर्ज हुए।`);
  const naturalLanguageSummaryHi = sentences.length > 0 ? sentences.join(" ") : isToday ? "आज अभी तक कोई रिकॉर्ड दर्ज नहीं हुआ है।" : "इस दिन कोई रिकॉर्ड दर्ज नहीं हुआ।";

  // ---- what changed (only a real, compared change counts) ----
  const sufficientMetrics = whatChanged?.metrics.filter((m) => m.isSufficient) ?? [];
  const hasPersistentChanges = sufficientMetrics.some(
    (m) => m.isPersistent && (m.direction !== "stable" || m.metric === "medicine_adherence"),
  );

  return {
    patientId: pid,
    patientName: profile.name,
    isPapa: false,
    dateStr,
    dateLabelHi: formatHumanDateHi(dateStr, today),
    cachedAt: formatNowIST(),
    cacheTimestamp: Date.now(),
    naturalLanguageSummaryHi,
    routineStatus,
    routineStatusHi: ROUTINE_HI[routineStatus],
    routineScore: wellness?.totalScore ?? 0,
    isScoreSufficient: wellness?.isSufficient ?? false,
    expectedItemsCount,
    recordedItemsCount,
    completenessPercent,
    completenessLabelHi:
      expectedItemsCount > 0
        ? `${recordedItemsCount} / ${expectedItemsCount} ट्रैकिंग मदें पूरी (${completenessPercent}% Complete)`
        : "अभी कोई मद दर्ज करने का समय नहीं हुआ",
    snapshot,
    highlights: highlights.slice(0, 3),
    attentionItems: attentionAll.slice(0, 5),
    todayVsUsual,
    whatChangedCompactHi: whatChanged?.compactSummaryHi || "तुलना के लिए अभी पर्याप्त डेटा नहीं है।",
    hasPersistentChanges,
  };
}

// ---------------------------------------------------------------------------
// Weekly / monthly
// ---------------------------------------------------------------------------

async function loadPeriod(pid: string, days: number) {
  const today = todayIST();
  const start = addDaysIST(today, -(days - 1));
  const dates = trailingDates(days, today);
  const [settings, series, scores] = await Promise.all([
    getPatientSettingsOrDefault(pid),
    loadSeries(pid, start, today, ["bp", "weight", "food", "sleep", "activity", "medicineLogs", "medicines"]),
    calculateWellnessScoresForRange(pid, start, today).catch(() => []),
  ]);
  const bp: PeriodBP[] = filterValidBPLogs(series.bp)
    .filter((b) => isPlausibleBP(b.systolic, b.diastolic, b.pulse))
    .map((b) => ({
      day: bpDay(b),
      systolic: b.systolic,
      diastolic: b.diastolic,
      readingType: b.reading_type,
      minutesOfDay: istMinutesOfDay(b.measured_at),
    }));
  const activity = filterValidActivityLogs(series.activity).filter((a) => a.steps > 0);
  const sleep = filterValidSleepLogs(series.sleep)
    .map((s) => ({ day: s.date, hours: Number(s.sleep_hours) }))
    .filter((s) => s.hours > 0);
  const weights = filterValidWeightLogs(series.weight).map((w) => ({ day: weightDay(w), kg: Number(w.weight_kg) }));
  const foodByDay = groupByDay(series.food, foodDay);
  const doses = buildDoseRecords(series.medicines, series.medicineLogs, start, today);
  const scored = scores.filter((s) => s.isSufficient);
  const routineScore = scored.length > 0 ? Math.round(scored.reduce((s, r) => s + r.totalScore, 0) / scored.length) : 0;
  return { today, start, dates, settings, series, bp, activity, sleep, weights, foodByDay, doses, scores, scored, routineScore };
}

export async function getCaregiverWeeklyBrief(patientId?: string): Promise<CaregiverWeeklyBrief> {
  const profile = await getPatientProfile(resolvePatientId(patientId));
  const pid = resolvePatientId(patientId) || profile.id;
  const [p, whatChanged] = await Promise.all([loadPeriod(pid, 7), getHealthChanges(pid, "7d").catch(() => null)]);

  const stepsAvg = mean(p.activity.map((a) => a.steps));
  const sleepAvg = mean(p.sleep.map((s) => s.hours));
  const calDays = [...p.foodByDay.entries()].filter(([day]) => day !== p.today);
  const kcalDays = calDays.map(([, rows]) => rows.reduce((s, f) => s + Number(f.calories || 0), 0)).filter((k) => k > 0);
  const calAvg = mean(kcalDays);
  const avgSys = mean(p.bp.map((b) => b.systolic));
  const avgDia = mean(p.bp.map((b) => b.diastolic));
  const adherence = summarizeAdherence(p.doses);

  const w = p.weights;
  const weightChange = w.length >= 2 && w[0].day !== w[w.length - 1].day ? Math.round((w[w.length - 1].kg - w[0].kg) * 10) / 10 : null;
  const weightChangeStr =
    weightChange === null
      ? "पर्याप्त डेटा नहीं"
      : weightChange === 0
        ? "वज़न स्थिर (0.0 kg)"
        : `${weightChange > 0 ? "+" : ""}${weightChange} kg बदलाव (इसी सप्ताह के पहले और आख़िरी माप के बीच)`;

  const topChanges = whatChanged?.metrics
    .filter((m) => m.isSufficient && m.direction !== "stable")
    .map((m) => `${m.metricHi}: ${m.directionLabelHi} (${m.percentChange > 0 ? "+" : ""}${m.percentChange}%)`)
    .slice(0, 3) ?? [];
  if (topChanges.length === 0) {
    topChanges.push(
      whatChanged?.dataSufficiency.isSufficient
        ? "तुलना किए गए मापों में कोई बड़ा बदलाव नहीं दिखा।"
        : "तुलना के लिए अभी पर्याप्त डेटा नहीं है।",
    );
  }

  const topAttention: string[] = [];
  const lines = bpAboveLines(p.bp, p.settings.bp_targets);
  if (lines.crisis > 0) topAttention.push(`${lines.crisis} BP माप क्राइसिस रेंज में रहे — डॉक्टर को ज़रूर बताएँ`);
  else if (lines.exceedsAlert > 0) topAttention.push(`${lines.exceedsAlert} BP माप अलर्ट सीमा से ऊपर रहे`);
  if (lines.low > 0) topAttention.push(`${lines.low} BP माप सामान्य से कम रहे`);
  if (adherence.missed > 0) topAttention.push(`इस सप्ताह ${adherence.missed} खुराकें छूटीं`);
  const gap = eveningGapDays(p.bp, p.settings.bp_monitoring_schedule, p.dates, p.today);
  if (gap > 0) topAttention.push(`शाम के BP रिकॉर्ड में ${gap} दिन का अंतराल रहा`);
  const lowSleep = lowSleepNights(p.sleep);
  if (lowSleep > 0) topAttention.push(`इस सप्ताह ${lowSleep} दिन नींद सामान्य से कम (6 घंटे से कम) रही`);
  if (topAttention.length === 0) topAttention.push("इस सप्ताह के दर्ज रिकॉर्ड में कोई विशेष चेतावनी नहीं मिली।");

  return {
    patientId: pid,
    patientName: profile.name,
    weekStartStr: p.start,
    weekEndStr: p.today,
    avgBP: avgSys !== null && avgDia !== null ? `${Math.round(avgSys)} / ${Math.round(avgDia)} mmHg` : "पर्याप्त डेटा नहीं",
    avgSteps: stepsAvg === null ? 0 : Math.round(stepsAvg),
    avgCalories: calAvg === null ? 0 : Math.round(calAvg),
    avgSleepHours: sleepAvg === null ? 0 : Math.round(sleepAvg * 10) / 10,
    medAdherencePercent: adherence.pct,
    weightChangeStr,
    routineScore: p.routineScore,
    routineScoreIsSufficient: p.scored.length > 0,
    dataCompletenessPercent: Math.round((p.scored.length / p.dates.length) * 100),
    topChanges,
    topAttention,
    hasData: {
      bp: p.bp.length > 0,
      steps: p.activity.length > 0,
      sleep: p.sleep.length > 0,
      calories: kcalDays.length > 0,
      medicines: adherence.evaluated > 0,
      weight: w.length > 0,
    },
  };
}

export async function getCaregiverMonthlyBrief(patientId?: string): Promise<CaregiverMonthlyBrief> {
  const profile = await getPatientProfile(resolvePatientId(patientId));
  const pid = resolvePatientId(patientId) || profile.id;
  const p = await loadPeriod(pid, 30);

  const stepsAvg = mean(p.activity.map((a) => a.steps));
  const sleepAvg = mean(p.sleep.map((s) => s.hours));
  const adherence = summarizeAdherence(p.doses);
  const weight = weightTrendOver(p.weights);
  const bpTrend = bpTrendOver(p.bp, p.settings.bp_targets);
  const foodDays = [...p.foodByDay.keys()].filter((d) => d >= p.start && d <= p.today).length;
  const lines = bpAboveLines(p.bp, p.settings.bp_targets);

  const notableChanges: string[] = [];
  if (adherence.pct !== null) notableChanges.push(`मासिक दवा नियमितता ${adherence.pct}% रही (${adherence.adherent} / ${adherence.evaluated} खुराकें)।`);
  if (stepsAvg !== null) notableChanges.push(`औसत दैनिक कदम ${Math.round(stepsAvg).toLocaleString("en-IN")} रहे (${p.activity.length} दर्ज दिनों में)।`);
  if (weight.change !== null) {
    const last = p.weights[p.weights.length - 1].kg;
    notableChanges.push(
      weight.trend === "Stable"
        ? `वज़न स्थिर रहा (${last} kg)।`
        : `इस माह वज़न का रुझान ${weight.trend === "Gaining" ? "बढ़ने" : "घटने"} का रहा (लगभग ${weight.change > 0 ? "+" : ""}${weight.change} kg; अभी ${last} kg)।`,
    );
  }
  if (lines.crisis + lines.exceedsAlert > 0) notableChanges.push(`${lines.crisis + lines.exceedsAlert} BP माप अलर्ट सीमा से ऊपर रहे।`);
  if (notableChanges.length === 0) notableChanges.push("इस माह पर्याप्त डेटा उपलब्ध नहीं है।");

  return {
    patientId: pid,
    patientName: profile.name,
    monthLabel: "विगत 30 दिन (Last 30 Days)",
    weightTrend: weight.trend,
    bpTrend,
    stepsAvg: stepsAvg === null ? 0 : Math.round(stepsAvg),
    sleepAvgHours: sleepAvg === null ? 0 : Math.round(sleepAvg * 10) / 10,
    medAdherencePercent: adherence.pct,
    foodConsistencyPercent: Math.round((foodDays / p.dates.length) * 100),
    routineScore: p.routineScore,
    routineScoreIsSufficient: p.scored.length > 0,
    notableChanges,
    hasData: {
      bp: p.bp.length > 0,
      steps: p.activity.length > 0,
      sleep: p.sleep.length > 0,
      medicines: adherence.evaluated > 0,
      weight: p.weights.length > 0,
    },
  };
}
