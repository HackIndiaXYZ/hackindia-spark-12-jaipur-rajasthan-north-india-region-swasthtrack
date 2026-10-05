/**
 * Weekly / monthly / yearly reports.
 *
 * Every report reads each series ONCE for its whole date window (IST days) and
 * scores every day from that same data, so a year costs the same handful of
 * requests as a week. "Average score" is the same everywhere: the mean of the
 * daily wellness scores over days that have any data.
 */
import { getActivePatientId } from "@/lib/active-patient";
import { addDaysIST, eachIST, todayIST } from "@/lib/health-rules";
import { buildDoseRecords, summarizeAdherence } from "@/lib/analytics/adherence";
import { buildWeeklyCsv } from "@/lib/analytics/report-csv";
import {
  buildDayTrend,
  formatDayLabel,
  formatRangeLabel,
  periodInsights,
  summarizePeriod,
  type DayTrendPoint,
  type PeriodInput,
} from "@/lib/analytics/report-calc";
import type { BPThresholds } from "@/lib/health-rules";
import { bpDay, foodDay, loadSeries, weightDay } from "./analytics-data";
import { filterValidActivityLogs, filterValidBPLogs, filterValidSleepLogs, filterValidWeightLogs } from "./data-quality-service";
import { NoActivePatientError } from "./patient-service";
import { getPatientSettingsOrDefault } from "./settings-service";
import { calculateWellnessScoresForRange, type DailyWellnessScoreResult } from "./wellness-score-service";

export type { DayTrendPoint };

/** The patient's own goals and lines, so charts can draw them without re-reading settings. */
export interface ReportTargets {
  bp: BPThresholds;
  stepGoal: number;
  sleepTargetHours: number;
  calorieTarget: number;
}

export interface DayScorePoint {
  date: string;
  dayLabel: string; // e.g. "Mon 24"
  /** 0 when the day has no data (`hasLogs` false): show "no data", not 0. */
  score: number;
  category: string;
  categoryHi: string;
  /** True when anything was logged that day. */
  hasLogs: boolean;
  scoreResult?: DailyWellnessScoreResult;
  /** Raw values for the day, for exports. */
  raw?: {
    bpReadings: string[];
    steps: number | null;
    sleepHours: number | null;
    calories: number | null;
    mealsLogged: number;
    weightKg: number | null;
    dosesDue: number;
    dosesAdherent: number;
  };
}

export interface WeeklyReportSummary {
  weekRangeLabel: string;
  startDate: string;
  endDate: string;
  hasSufficientData: boolean;
  daysTrackedCount: number;
  totalDays: number;
  averageScore: number;
  highestScore: { score: number; date: string; dayLabel: string } | null;
  lowestScore: { score: number; date: string; dayLabel: string } | null;
  /** 0 when no dose was due (see hasMedicineData; undefined = unknown, treat as no data). */
  medicineAdherencePercent: number;
  /** False when no medicine dose was due in the period; the percentage above is then not a measurement. */
  hasMedicineData?: boolean;
  foodLoggingConsistencyPercent: number;
  averageCalories: number | null;
  averageSteps: number | null;
  averageSleepHours: number | null;
  bpReadingsCount: number;
  weightChangeKg: number | null;
  startWeightKg: number | null;
  endWeightKg: number | null;
  dailyScores: DayScorePoint[];
  personalizedInsights: string[];
}

/** The weekly summary plus what the report page charts (the email templates only need the summary). */
export interface WeeklyReportData extends WeeklyReportSummary {
  /** One point per day of the window (oldest first), for the trend charts. */
  trend: DayTrendPoint[];
  targets: ReportTargets;
}

export interface MonthlyReportSummary {
  monthLabel: string;
  startDate: string;
  endDate: string;
  hasSufficientData: boolean;
  daysTrackedCount: number;
  totalDays: number;
  averageScore: number;
  medicineAdherencePercent: number;
  hasMedicineData?: boolean;
  foodLoggingPercent: number;
  activityConsistencyPercent: number;
  sleepLoggingPercent: number;
  bpLoggingPercent: number;
  weightLoggingPercent: number;
  averageCalories: number | null;
  averageSteps: number | null;
  totalBpReadings: number;
  startWeightKg: number | null;
  endWeightKg: number | null;
  weightChangeKg: number | null;
  personalizedInsights: string[];
}

/** The monthly summary plus what the report page charts. */
export interface MonthlyReportData extends MonthlyReportSummary {
  /** Length of the window in days (30 for the monthly report). */
  periodDays: number;
  /** One point per day of the window (oldest first), for the trend charts. */
  trend: DayTrendPoint[];
  targets: ReportTargets;
  averageSleepHours: number | null;
}

export interface YearlyMonthSummary {
  monthName: string;
  monthNumber: number;
  averageScore: number;
  medicineAdherencePercent: number;
  hasMedicineData?: boolean;
  bpReadingsCount: number;
  averageWeightKg: number | null;
  daysTracked: number;
}

export interface YearlyReportSummary {
  year: number;
  hasSufficientData: boolean;
  averageScore: number;
  totalDaysTracked: number;
  months: YearlyMonthSummary[];
  personalizedInsights: string[];
}

function resolvePatient(patientId?: string): string {
  const pid = patientId || getActivePatientId();
  if (!pid) throw new NoActivePatientError();
  return pid;
}

function targetsOf(settings: Awaited<ReturnType<typeof getPatientSettingsOrDefault>>): ReportTargets {
  return {
    bp: settings.bp_targets,
    stepGoal: settings.daily_step_goal,
    sleepTargetHours: settings.sleep_target_hours,
    calorieTarget: settings.daily_calorie_target,
  };
}

/** Everything a report needs for [start, end], read once; the scores use the same reads. */
async function loadReportData(pid: string, start: string, end: string) {
  const [settings, series, scores] = await Promise.all([
    getPatientSettingsOrDefault(pid),
    // The scorer reads [start - 7, end]; asking for the same window shares one cached response.
    loadSeries(pid, addDaysIST(start, -7), end, ["bp", "weight", "food", "sleep", "activity", "medicineLogs", "medicines"]),
    calculateWellnessScoresForRange(pid, start, end),
  ]);
  const inRange = (d: string) => d >= start && d <= end;
  const bpRows = filterValidBPLogs(series.bp).filter((b) => inRange(bpDay(b)));
  const weightRows = filterValidWeightLogs(series.weight).filter((w) => inRange(weightDay(w)));
  const foodRows = series.food.filter((f) => inRange(foodDay(f)));
  const sleepRows = filterValidSleepLogs(series.sleep).filter((s) => inRange(s.date));
  const activityRows = filterValidActivityLogs(series.activity).filter((a) => inRange(a.date));
  const doses = buildDoseRecords(series.medicines, series.medicineLogs, start, end);
  return { settings, scores, bpRows, weightRows, foodRows, sleepRows, activityRows, doses };
}

function periodInput(
  dates: string[],
  d: Awaited<ReturnType<typeof loadReportData>>,
): PeriodInput {
  return {
    dates,
    today: todayIST(),
    scores: d.scores,
    bp: d.bpRows.map((b) => ({ day: bpDay(b), systolic: b.systolic, diastolic: b.diastolic })),
    weights: d.weightRows.map((w) => ({ day: weightDay(w), kg: Number(w.weight_kg) })),
    food: d.foodRows.map((f) => ({ day: foodDay(f), calories: Number(f.calories || 0) })),
    steps: d.activityRows.map((a) => ({ day: a.date, steps: a.steps })),
    sleep: d.sleepRows.map((s) => ({ day: s.date, hours: Number(s.sleep_hours) })),
    doses: d.doses,
    goals: { stepGoal: d.settings.daily_step_goal },
    thresholds: d.settings.bp_targets,
    bpSchedule: d.settings.bp_monitoring_schedule,
  };
}

// ---------------------------------------------------------------------------
// Weekly
// ---------------------------------------------------------------------------

export async function getWeeklyReportData(patientId?: string, endDate?: string): Promise<WeeklyReportData> {
  const pid = resolvePatient(patientId);
  const end = endDate || todayIST();
  const start = addDaysIST(end, -6);
  const dates = eachIST(start, end);

  const d = await loadReportData(pid, start, end);
  const input = periodInput(dates, d);
  const stats = summarizePeriod(input);

  const dailyScores: DayScorePoint[] = d.scores.map((r) => {
    const bpDayRows = d.bpRows.filter((b) => bpDay(b) === r.date);
    const foodDayRows = d.foodRows.filter((f) => foodDay(f) === r.date);
    const doses = d.doses.filter((x) => x.date === r.date);
    const ad = summarizeAdherence(doses);
    return {
      date: r.date,
      dayLabel: formatDayLabel(r.date),
      score: r.totalScore,
      category: r.category,
      categoryHi: r.categoryHi,
      hasLogs: r.isSufficient,
      scoreResult: r,
      raw: {
        bpReadings: bpDayRows.map((b) => `${b.systolic}/${b.diastolic}`),
        steps: d.activityRows.filter((a) => a.date === r.date && a.steps > 0).pop()?.steps ?? null,
        sleepHours: d.sleepRows.filter((s) => s.date === r.date && Number(s.sleep_hours) > 0).map((s) => Number(s.sleep_hours)).pop() ?? null,
        calories: foodDayRows.length > 0 ? Math.round(foodDayRows.reduce((s, f) => s + Number(f.calories || 0), 0)) : null,
        mealsLogged: new Set(foodDayRows.map((f) => f.meal_type)).size,
        weightKg: d.weightRows.filter((w) => weightDay(w) === r.date).map((w) => Number(w.weight_kg)).pop() ?? null,
        dosesDue: ad.due,
        dosesAdherent: ad.adherent,
      },
    };
  });

  const label = (date: string) => ({ date, dayLabel: formatDayLabel(date) });
  return {
    weekRangeLabel: formatRangeLabel(start, end),
    startDate: start,
    endDate: end,
    hasSufficientData: stats.scoredDays >= 3,
    daysTrackedCount: stats.scoredDays,
    totalDays: dates.length,
    averageScore: stats.averageScore,
    highestScore: stats.highest ? { score: stats.highest.score, ...label(stats.highest.date) } : null,
    lowestScore: stats.lowest ? { score: stats.lowest.score, ...label(stats.lowest.date) } : null,
    medicineAdherencePercent: stats.adherence.pct ?? 0,
    hasMedicineData: stats.adherence.evaluated > 0,
    foodLoggingConsistencyPercent: Math.round((stats.foodDays / dates.length) * 100),
    averageCalories: stats.averageCalories,
    averageSteps: stats.averageSteps,
    averageSleepHours: stats.averageSleepHours,
    bpReadingsCount: stats.bpCount,
    weightChangeKg: stats.weightChangeKg,
    startWeightKg: stats.start?.kg ?? null,
    endWeightKg: stats.end?.kg ?? null,
    dailyScores,
    trend: buildDayTrend(input),
    targets: targetsOf(d.settings),
    personalizedInsights: periodInsights(input, stats, "हफ्ते"),
  };
}

// ---------------------------------------------------------------------------
// Monthly (a rolling window of `days` IST days ending on `endDate`; 30 by default)
// ---------------------------------------------------------------------------

export async function getMonthlyReportData(patientId?: string, endDate?: string, days = 30): Promise<MonthlyReportData> {
  const pid = resolvePatient(patientId);
  const end = endDate || todayIST();
  const start = addDaysIST(end, -(days - 1));
  const dates = eachIST(start, end);

  const d = await loadReportData(pid, start, end);
  const input = periodInput(dates, d);
  const stats = summarizePeriod(input);
  const pct = (n: number) => Math.round((n / dates.length) * 100);
  return {
    monthLabel: formatRangeLabel(start, end),
    startDate: start,
    endDate: end,
    hasSufficientData: stats.scoredDays >= 7,
    daysTrackedCount: stats.scoredDays,
    totalDays: dates.length,
    averageScore: stats.averageScore,
    medicineAdherencePercent: stats.adherence.pct ?? 0,
    hasMedicineData: stats.adherence.evaluated > 0,
    foodLoggingPercent: pct(stats.foodDays),
    activityConsistencyPercent: pct(stats.activityDays),
    sleepLoggingPercent: pct(stats.sleepDays),
    bpLoggingPercent: pct(stats.bpDays),
    weightLoggingPercent: pct(stats.weightDays),
    averageCalories: stats.averageCalories,
    averageSteps: stats.averageSteps,
    averageSleepHours: stats.averageSleepHours,
    totalBpReadings: stats.bpCount,
    startWeightKg: stats.start?.kg ?? null,
    endWeightKg: stats.end?.kg ?? null,
    weightChangeKg: stats.weightChangeKg,
    periodDays: dates.length,
    trend: buildDayTrend(input),
    targets: targetsOf(d.settings),
    personalizedInsights: [
      `इन ${dates.length} दिनों में से ${stats.scoredDays} दिन कुछ न कुछ दर्ज हुआ।`,
      ...periodInsights(input, stats, days <= 31 ? "महीने" : "अवधि"),
    ],
  };
}

// ---------------------------------------------------------------------------
// Yearly
// ---------------------------------------------------------------------------

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** One set of reads for the whole year (never beyond today), then grouped by month. */
export async function getYearlyReportData(patientId?: string, targetYear?: number): Promise<YearlyReportSummary> {
  const pid = resolvePatient(patientId);
  const today = todayIST();
  const year = targetYear || Number(today.slice(0, 4));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31` < today ? `${year}-12-31` : today;

  if (yearStart > today) {
    return {
      year,
      hasSufficientData: false,
      averageScore: 0,
      totalDaysTracked: 0,
      months: MONTH_NAMES.map((monthName, i) => ({
        monthName,
        monthNumber: i + 1,
        averageScore: 0,
        medicineAdherencePercent: 0,
        hasMedicineData: false,
        bpReadingsCount: 0,
        averageWeightKg: null,
        daysTracked: 0,
      })),
      personalizedInsights: [`वर्ष ${year} अभी शुरू नहीं हुआ है।`],
    };
  }

  const d = await loadReportData(pid, yearStart, yearEnd);

  const months: YearlyMonthSummary[] = MONTH_NAMES.map((monthName, i) => {
    const prefix = `${year}-${String(i + 1).padStart(2, "0")}-`;
    const scored = d.scores.filter((s) => s.date.startsWith(prefix) && s.isSufficient);
    const weights = d.weightRows.filter((w) => weightDay(w).startsWith(prefix)).map((w) => Number(w.weight_kg));
    const ad = summarizeAdherence(d.doses.filter((x) => x.date.startsWith(prefix)));
    return {
      monthName,
      monthNumber: i + 1,
      averageScore: scored.length ? Math.round(scored.reduce((s, r) => s + r.totalScore, 0) / scored.length) : 0,
      medicineAdherencePercent: ad.pct ?? 0,
      hasMedicineData: ad.evaluated > 0,
      bpReadingsCount: d.bpRows.filter((b) => bpDay(b).startsWith(prefix)).length,
      averageWeightKg: weights.length ? Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 10) / 10 : null,
      daysTracked: scored.length,
    };
  });

  const allScored = d.scores.filter((s) => s.isSufficient);
  const totalDaysTracked = allScored.length;
  const averageScore = totalDaysTracked ? Math.round(allScored.reduce((s, r) => s + r.totalScore, 0) / totalDaysTracked) : 0;
  const yearAdherence = summarizeAdherence(d.doses);

  const insights = [`वर्ष ${year} में कुल ${totalDaysTracked} दिन ट्रैकिंग रिकॉर्ड दर्ज हुए।`];
  if (yearAdherence.evaluated >= 10 && yearAdherence.pct !== null) {
    insights.push(`साल भर दवा नियमितता ${yearAdherence.pct}% रही (${yearAdherence.evaluated} में से ${yearAdherence.adherent} खुराकें)।`);
  }
  if (totalDaysTracked > 0) insights.push("वार्षिक रिकॉर्ड आपके डॉक्टर के नियमित चेकअप में मदद करते हैं।");

  return { year, hasSufficientData: totalDaysTracked > 0, averageScore, totalDaysTracked, months, personalizedInsights: insights };
}

// ---------------------------------------------------------------------------
// Doctor CSV (RFC 4180; includes the BP values themselves)
// ---------------------------------------------------------------------------

export function generateCSVReport(weekly: WeeklyReportSummary, patientName: string): string {
  return buildWeeklyCsv(weekly, patientName, todayIST());
}
