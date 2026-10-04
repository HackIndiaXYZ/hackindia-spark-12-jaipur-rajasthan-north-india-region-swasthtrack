import { todayIST } from "@/lib/health-rules";
import { buildDoseRecords, summarizeAdherence } from "@/lib/analytics/adherence";
import {
  BASELINE_WINDOW_DAYS,
  calculateStats,
  computeBaselineMetrics,
  type BaselineMetrics,
  type BaselineWindow,
  type MetricBaseline,
} from "@/lib/analytics/baseline-calc";
import { filterWindow, groupByDay, recentWindow } from "@/lib/analytics/dates";
import { bpDay, foodDay, loadSeries, weightDay } from "./analytics-data";
import {
  assessActivityLogs,
  assessBPLogs,
  assessSleepLogs,
  assessWeightLogs,
  summarizeQuality,
  type DataQualitySummary,
} from "./data-quality-service";

export { calculateStats };
export type { BaselineWindow, MetricBaseline };

export interface PatientPersonalBaseline extends BaselineMetrics {
  patientId: string;
  generatedAt: string;
  window: BaselineWindow;
  /** IST dates (inclusive) the baseline was computed over. */
  windowStart: string;
  windowEnd: string;
  /** Rows that were left out (impossible values) or flagged (unusual values). */
  dataQuality: DataQualitySummary;
}

const _inflight = new Map<string, Promise<PatientPersonalBaseline>>();

/** The patient's own recent pattern over the last 7/14/30/90 IST days, from one set of reads. */
export function calculatePersonalBaseline(
  patientId: string,
  window: BaselineWindow = "30d",
): Promise<PatientPersonalBaseline> {
  const key = `${patientId}|${window}`;
  const pending = _inflight.get(key);
  if (pending) return pending;
  const request = computeBaseline(patientId, window).finally(() => {
    _inflight.delete(key);
  });
  _inflight.set(key, request);
  return request;
}

async function computeBaseline(patientId: string, window: BaselineWindow): Promise<PatientPersonalBaseline> {
  const today = todayIST();
  const w = recentWindow(BASELINE_WINDOW_DAYS[window], today);

  const series = await loadSeries(patientId, w.start, w.end, [
    "bp",
    "weight",
    "food",
    "sleep",
    "activity",
    "medicineLogs",
    "medicines",
  ]);

  const bp = assessBPLogs(filterWindow(series.bp, bpDay, w));
  const weight = assessWeightLogs(filterWindow(series.weight, weightDay, w));
  const activity = assessActivityLogs(filterWindow(series.activity, (a) => a.date, w));
  const sleep = assessSleepLogs(filterWindow(series.sleep, (s) => s.date, w));

  // Today's food log is a partial day; leaving it in would drag "usual calories" down every morning.
  const foodByDay = groupByDay(
    series.food.filter((f) => foodDay(f) !== today),
    foodDay,
  );
  const dailyCalories = [...foodByDay.values()]
    .map((rows) => rows.reduce((s, f) => s + Number(f.calories || 0), 0))
    .filter((kcal) => kcal > 0);

  const doses = buildDoseRecords(series.medicines, series.medicineLogs, w.start, w.end);
  const metrics = computeBaselineMetrics({
    window,
    bp: bp.usable.map((b) => ({ systolic: b.systolic, diastolic: b.diastolic, pulse: b.pulse })),
    weights: weight.usable.map((x) => Number(x.weight_kg)),
    dailyCalories,
    steps: activity.usable.filter((a) => a.steps > 0).map((a) => a.steps),
    sleepHours: sleep.usable.map((s) => Number(s.sleep_hours)).filter((h) => h > 0),
    adherence: summarizeAdherence(doses),
  });

  return {
    patientId,
    generatedAt: new Date().toISOString(),
    window,
    windowStart: w.start,
    windowEnd: w.end,
    ...metrics,
    dataQuality: summarizeQuality([
      { label: { en: "blood pressure", hi: "BP" }, questionable: bp.questionable, invalid: bp.invalid },
      { label: { en: "weight", hi: "वज़न" }, questionable: weight.questionable, invalid: weight.invalid },
      { label: { en: "step", hi: "कदम" }, questionable: activity.questionable, invalid: activity.invalid },
      { label: { en: "sleep", hi: "नींद" }, questionable: sleep.questionable, invalid: sleep.invalid },
    ]),
  };
}
