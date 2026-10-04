/**
 * Daily wellness score (see src/lib/analytics/wellness-calc.ts for the model).
 *
 * This file only fetches: each series is read once for the whole date range, and
 * every day in the range is scored from that same data, so a week/month/year
 * report costs the same number of requests as a single day.
 */
import { getActivePatientId } from "@/lib/active-patient";
import {
  addDaysIST,
  istMinutesOfDay,
  toISTDate,
  todayIST,
  type BPSchedule,
} from "@/lib/health-rules";
import { buildDoseRecords } from "@/lib/analytics/adherence";
import { groupByDay } from "@/lib/analytics/dates";
import {
  DEFAULT_SCORE_WEIGHTS,
  computeDailyWellness,
  getScoreCategory,
  type DailyWellnessScoreResult,
  type ScoreWeights,
} from "@/lib/analytics/wellness-calc";
import { bpDay, foodDay, loadSeries, weightDay } from "./analytics-data";
import { filterValidActivityLogs, filterValidBPLogs, filterValidSleepLogs, filterValidWeightLogs } from "./data-quality-service";
import { NoActivePatientError } from "./patient-service";
import { getPatientSettingsOrDefault } from "./settings-service";

export { DEFAULT_SCORE_WEIGHTS, getScoreCategory };
export type {
  ComponentScoreBreakdown,
  ConsistencyCategory,
  DailyWellnessScoreResult,
  ScoreWeights,
  WellnessAlert,
  WellnessBreakdownItem,
} from "@/lib/analytics/wellness-calc";

/** Largest range scored in one call (a year of days from one set of reads). */
const MAX_RANGE_DAYS = 366;

function resolvePatient(patientId?: string): string {
  const pid = patientId || getActivePatientId();
  if (!pid) throw new NoActivePatientError();
  return pid;
}

/**
 * Score every IST day from startDate to endDate (inclusive) from one set of reads.
 * Results are in date order.
 */
export async function calculateWellnessScoresForRange(
  patientId: string,
  startDate: string,
  endDate: string,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): Promise<DailyWellnessScoreResult[]> {
  const pid = resolvePatient(patientId);
  if (endDate < startDate) return [];
  const today = todayIST();
  // Bound the work for accidental huge ranges. Future days are scored as "nothing due yet".
  const lastDate = endDate;
  let firstDate = startDate;
  const span = Math.round((Date.parse(lastDate) - Date.parse(firstDate)) / 86_400_000) + 1;
  if (span > MAX_RANGE_DAYS) firstDate = addDaysIST(lastDate, -(MAX_RANGE_DAYS - 1));

  const [settings, series] = await Promise.all([
    getPatientSettingsOrDefault(pid),
    loadSeries(pid, addDaysIST(firstDate, -7), lastDate, ["bp", "weight", "food", "sleep", "activity", "medicineLogs", "medicines"]),
  ]);

  const now = new Date();
  const nowMinutes = istMinutesOfDay(now);
  const bp = filterValidBPLogs(series.bp);
  const weightRows = filterValidWeightLogs(series.weight);
  const sleepRows = filterValidSleepLogs(series.sleep);
  const activityRows = filterValidActivityLogs(series.activity);

  const bpByDay = groupByDay(bp, bpDay);
  const foodByDay = groupByDay(series.food, foodDay);
  const weightByDay = groupByDay(weightRows, weightDay);
  const sleepByDay = groupByDay(sleepRows, (s) => s.date);
  const activityByDay = groupByDay(activityRows, (a) => a.date);
  const doses = buildDoseRecords(series.medicines, series.medicineLogs, firstDate, lastDate, now);
  const dosesByDay = groupByDay(doses, (d) => d.date);

  const results: DailyWellnessScoreResult[] = [];
  for (let date = firstDate; date <= lastDate; date = addDaysIST(date, 1)) {
    const dayNow = date === today ? nowMinutes : date < today ? null : -1;

    const recentWeights: Array<{ date: string; kg: number }> = [];
    for (let back = 7; back >= 0; back--) {
      const d = addDaysIST(date, -back);
      const rows = weightByDay.get(d);
      if (rows && rows.length > 0) recentWeights.push({ date: d, kg: Number(rows[rows.length - 1].weight_kg) });
    }

    const activity = activityByDay.get(date);
    const sleep = sleepByDay.get(date);
    const hasActiveMedicines = series.medicines.some(
      (m) => m.active && (!m.created_at || toISTDate(m.created_at) <= date),
    );

    results.push(
      computeDailyWellness({
        date,
        patientId: pid,
        nowMinutes: dayNow,
        doses: dosesByDay.get(date) ?? [],
        hasActiveMedicines,
        foodLogs: (foodByDay.get(date) ?? []).map((f) => ({ meal_type: f.meal_type, calories: f.calories })),
        steps: activity && activity.length > 0 ? Number(activity[activity.length - 1].steps) : null,
        sleepHours: sleep && sleep.length > 0 ? Number(sleep[sleep.length - 1].sleep_hours) : null,
        bpReadings: (bpByDay.get(date) ?? []).map((b) => ({
          systolic: b.systolic,
          diastolic: b.diastolic,
          pulse: b.pulse,
          readingType: b.reading_type,
          minutesOfDay: istMinutesOfDay(b.measured_at),
        })),
        recentWeights,
        goals: {
          calorieTarget: settings.daily_calorie_target,
          stepGoal: settings.daily_step_goal,
          sleepTarget: settings.sleep_target_hours,
        },
        bpSchedule: settings.bp_monitoring_schedule as BPSchedule,
        bpThresholds: settings.bp_targets,
        weights,
      }),
    );
  }
  return results;
}

const _inflight = new Map<string, Promise<DailyWellnessScoreResult>>();

/**
 * Single source of truth for one day's score. Concurrent identical calls share
 * one computation; results are not cached beyond that, so a fresh log is
 * reflected as soon as patient-service's own (write-invalidated) cache is.
 */
export function calculateDailyWellnessScore(
  patientId: string,
  targetDateStr: string,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): Promise<DailyWellnessScoreResult> {
  const pid = resolvePatient(patientId);
  const key = `${pid}|${targetDateStr}|${JSON.stringify(weights)}`;
  const pending = _inflight.get(key);
  if (pending) return pending;
  const request = calculateWellnessScoresForRange(pid, targetDateStr, targetDateStr, weights)
    .then((r) => r[0])
    .finally(() => {
      _inflight.delete(key);
    });
  _inflight.set(key, request);
  return request;
}
