/**
 * Short-range "forecast from recent history" for weight, systolic BP and steps.
 *
 * Despite the file name this is not machine learning: it is a robust straight-line
 * trend over the last weeks (see src/lib/analytics/forecast-calc.ts) projected 7
 * days ahead with an honest band. Nothing is persisted (there is no table for it);
 * predictions are recomputed on demand from the real logs.
 */
import { getActivePatientId } from "@/lib/active-patient";
import {
  BP_RELATIVE_MIN_MARGIN_MMHG,
  WEIGHT_STABLE_KG,
  addDaysIST,
  median,
  round,
  todayIST,
} from "@/lib/health-rules";
import { ageInDays, groupByDay } from "@/lib/analytics/dates";
import { forecastRange, type ForecastResult } from "@/lib/analytics/forecast-calc";
import { readLocalPref, writeLocalPref } from "@/lib/utils";
import { bpDay, loadSeries, weightDay } from "./analytics-data";
import {
  assessActivityLogs,
  assessBPLogs,
  assessWeightLogs,
  summarizeQuality,
  type DataQualitySummary,
} from "./data-quality-service";
import { getPatientSettingsOrDefault } from "./settings-service";

export type ConfidenceLevel = "High" | "Medium" | "Low";

export interface HealthPrediction {
  id: string;
  patientId: string;
  predictionType: "weight_forecast" | "bp_trend" | "activity_trend" | "calorie_trend";
  metricLabel: string;
  metricLabelHi: string;
  rangeFormatted: string;
  lowerBound: number;
  upperBound: number;
  unit: string;
  confidence: ConfidenceLevel;
  /** Number of data points (days with a reading) behind the range. */
  dataPointsUsed: number;
  explanation: string;
  explanationHi: string;
  modelVersion: string;
  generatedAt: string;
  expiresAt: string;
  isAvailable: boolean;
  unavailableReason?: string;
  unavailableReasonHi?: string;
  /** Robust trend over the history used, per week (null when unavailable). */
  trendPerWeek?: number | null;
  /** First and last day of the history behind this range (IST). */
  basedOn?: { from: string; to: string };
}

export interface InsightFeedback {
  insightId: string;
  patientId: string;
  isHelpful: boolean;
  reason?: string;
  submittedAt: string;
}

/** Real, measured numbers only; fields are null/zero when nothing has run yet this session. */
export interface MLDiagnostics {
  modelVersion: string;
  modelType: string;
  /** Forecast ranges produced (available ones) since this page was opened. */
  predictionCount: number;
  lastInferenceTime: string | null;
  /** Mean wall-clock time of generateHealthPredictions runs this session; null before the first run. */
  averageInferenceLatencyMs: number | null;
  /** Confidence of the available ranges from the most recent run. */
  confidenceDistribution: { high: number; medium: number; low: number };
  /** Distinct patients forecast this session. */
  activePatientBaselines: number;
  /** Feedback saved on this device for the active patient. */
  feedbackStats: { positive: number; negative: number };
}

export const MODEL_VERSION = "history-range-v2 (robust trend + median/MAD band)";
const HORIZON_DAYS = 7;
const HISTORY_DAYS = 45;

// ---------------------------------------------------------------------------
// Session statistics (in memory; nothing here is invented)
// ---------------------------------------------------------------------------

const session = {
  runs: 0,
  predictions: 0,
  latenciesMs: [] as number[],
  lastAt: null as string | null,
  lastConfidence: { high: 0, medium: 0, low: 0 },
  patients: new Set<string>(),
};

function feedbackKey(patientId: string): string {
  return `swasthtrack_forecast_feedback_${patientId}`;
}

function formatRange(lower: number, upper: number, decimals: number, unit: string): string {
  const f = (n: number) => (decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString("en-IN"));
  return `${f(lower)}–${f(upper)} ${unit}`;
}

function toPoints(series: Array<{ day: string; value: number }>) {
  if (series.length === 0) return [];
  const origin = series[0].day;
  return series.map((s) => ({ x: ageInDays(origin, s.day), y: s.value }));
}

/** One value per IST day (median of that day's readings) so a morning+evening pair is one point. */
function dailyMedians<T>(rows: T[], day: (r: T) => string, value: (r: T) => number): Array<{ day: string; value: number }> {
  return [...groupByDay(rows, day).entries()]
    .map(([d, list]) => ({ day: d, value: median(list.map(value)) as number }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function build(
  patientId: string,
  type: HealthPrediction["predictionType"],
  labels: { en: string; hi: string },
  unit: string,
  decimals: number,
  fit: ForecastResult,
  basedOn: { from: string; to: string } | undefined,
  generatedAt: string,
  expiresAt: string,
  texts: { en: string; hi: string },
): HealthPrediction {
  const base = {
    id: `pred-${type}-${patientId}`,
    patientId,
    predictionType: type,
    metricLabel: labels.en,
    metricLabelHi: labels.hi,
    unit,
    modelVersion: MODEL_VERSION,
    generatedAt,
    expiresAt,
    dataPointsUsed: fit.points,
  };
  if (!fit.isAvailable) {
    return {
      ...base,
      rangeFormatted: "--",
      lowerBound: 0,
      upperBound: 0,
      confidence: "Low",
      explanation: fit.reason?.en ?? "Not enough readings for a forecast range.",
      explanationHi: fit.reason?.hi ?? "अनुमान के लिए अभी पर्याप्त माप नहीं हैं।",
      isAvailable: false,
      unavailableReason: fit.reason?.en,
      unavailableReasonHi: fit.reason?.hi,
    };
  }
  const lower = round(fit.lower, decimals);
  const upper = round(fit.upper, decimals);
  return {
    ...base,
    rangeFormatted: formatRange(lower, upper, decimals, unit),
    lowerBound: lower,
    upperBound: upper,
    confidence: fit.confidence,
    explanation: texts.en,
    explanationHi: texts.hi,
    isAvailable: true,
    trendPerWeek: round(fit.slopePerDay * 7, decimals + 1),
    basedOn,
  };
}

/**
 * Forecast ranges for the next 7 days, from the last ~6 weeks of real readings.
 * The range is where readings are likely to fall if the recent pattern simply
 * continues. It is not a diagnosis and says nothing about causes.
 */
export async function generateHealthPredictions(patientId: string): Promise<{
  predictions: HealthPrediction[];
  modelVersion: string;
  generatedAt: string;
  dataQuality: DataQualitySummary;
}> {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const pid = patientId || getActivePatientId() || "";
  const today = todayIST();
  const start = addDaysIST(today, -(HISTORY_DAYS - 1));
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const [settings, series] = await Promise.all([
    getPatientSettingsOrDefault(pid),
    loadSeries(pid, start, today, ["weight", "bp", "activity"]),
  ]);

  const weight = assessWeightLogs(series.weight);
  const bp = assessBPLogs(series.bp);
  const activity = assessActivityLogs(series.activity);

  const predictions: HealthPrediction[] = [];

  // ---- weight: band never narrower than the "stable" distance ----
  {
    const days = dailyMedians(weight.usable, weightDay, (w) => Number(w.weight_kg));
    const fit = forecastRange(toPoints(days), {
      horizonDays: HORIZON_DAYS,
      minPoints: 3,
      minSpanDays: 5,
      minHalfWidth: WEIGHT_STABLE_KG,
      highConfidenceRelWidth: 0.02,
      floor: 20,
    });
    const weekly = round(fit.slopePerDay * 7, 1);
    predictions.push(
      build(
        pid,
        "weight_forecast",
        { en: "Weight range, next 7 days (from recent history)", hi: "अगले 7 दिनों का संभावित वज़न दायरा (हाल के माप के आधार पर)" },
        "kg",
        1,
        fit,
        days.length ? { from: days[0].day, to: days[days.length - 1].day } : undefined,
        generatedAt,
        expiresAt,
        {
          en: `If the recent pattern continues (about ${weekly > 0 ? "+" : ""}${weekly} kg a week), weight is likely to fall in this range. Based on ${fit.points} weigh-in days over ${fit.spanDays} days; the range is wider when readings are few or uneven. An estimate, not a diagnosis.`,
          hi: `अगर हाल का पैटर्न जारी रहा (लगभग ${weekly > 0 ? "+" : ""}${weekly} kg प्रति सप्ताह), तो वज़न इस दायरे में रहने की संभावना है। ${fit.spanDays} दिनों के ${fit.points} माप-दिनों पर आधारित; माप कम या बिखरे हों तो दायरा चौड़ा रहता है। यह अनुमान है, निदान नहीं।`,
        },
      ),
    );
  }

  // ---- systolic BP (daily median; band never narrower than the personal-baseline margin) ----
  {
    const days = dailyMedians(bp.usable, bpDay, (b) => b.systolic);
    const fit = forecastRange(toPoints(days), {
      horizonDays: HORIZON_DAYS,
      minPoints: 4,
      minSpanDays: 6,
      minHalfWidth: BP_RELATIVE_MIN_MARGIN_MMHG,
      highConfidenceRelWidth: 0.08,
      floor: 50,
    });
    const weekly = round(fit.slopePerDay * 7, 1);
    const t = settings.bp_targets;
    predictions.push(
      build(
        pid,
        "bp_trend",
        { en: "Systolic BP range, next 7 days (from recent history)", hi: "अगले 7 दिनों का संभावित सिस्टोलिक BP दायरा (हाल के माप के आधार पर)" },
        "mmHg",
        0,
        fit,
        days.length ? { from: days[0].day, to: days[days.length - 1].day } : undefined,
        generatedAt,
        expiresAt,
        {
          en: `Where the daily systolic reading is likely to fall if the recent pattern continues (about ${weekly > 0 ? "+" : ""}${weekly} mmHg a week). The target for this patient is below ${t.target_systolic}/${t.target_diastolic}; this range is a reference for comparing new readings, not a target and not a diagnosis.`,
          hi: `अगर हाल का पैटर्न जारी रहा (लगभग ${weekly > 0 ? "+" : ""}${weekly} mmHg प्रति सप्ताह), तो रोज़ का सिस्टोलिक माप इस दायरे में आ सकता है। इस मरीज़ का लक्ष्य ${t.target_systolic}/${t.target_diastolic} से कम है; यह दायरा नए माप की तुलना के लिए संदर्भ है, लक्ष्य या निदान नहीं।`,
        },
      ),
    );
  }

  // ---- steps (only days that have steps) ----
  {
    const days = dailyMedians(
      activity.usable.filter((a) => a.steps > 0),
      (a) => a.date,
      (a) => a.steps,
    );
    const centerGuess = days.length ? (median(days.map((d) => d.value)) as number) : 0;
    const fit = forecastRange(toPoints(days), {
      horizonDays: HORIZON_DAYS,
      minPoints: 4,
      minSpanDays: 6,
      minHalfWidth: Math.max(500, centerGuess * 0.1),
      highConfidenceRelWidth: 0.25,
      floor: 0,
    });
    const goal = settings.daily_step_goal;
    predictions.push(
      build(
        pid,
        "activity_trend",
        { en: "Daily steps range, next 7 days (from recent history)", hi: "अगले 7 दिनों के रोज़ के कदमों का संभावित दायरा (हाल के माप के आधार पर)" },
        "steps",
        0,
        fit,
        days.length ? { from: days[0].day, to: days[days.length - 1].day } : undefined,
        generatedAt,
        expiresAt,
        {
          en: `Likely daily step count if the recent pattern continues, based on ${fit.points} logged days. The patient's goal is ${goal.toLocaleString("en-IN")} steps.`,
          hi: `अगर हाल का पैटर्न जारी रहा तो रोज़ के कदम इस दायरे में रह सकते हैं (${fit.points} दर्ज दिनों पर आधारित)। मरीज़ का लक्ष्य ${goal.toLocaleString("en-IN")} कदम है।`,
        },
      ),
    );
  }

  // ---- real session telemetry ----
  const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
  const available = predictions.filter((p) => p.isAvailable);
  session.runs += 1;
  session.predictions += available.length;
  session.latenciesMs.push(elapsed);
  session.lastAt = generatedAt;
  session.patients.add(pid);
  session.lastConfidence = {
    high: available.filter((p) => p.confidence === "High").length,
    medium: available.filter((p) => p.confidence === "Medium").length,
    low: available.filter((p) => p.confidence === "Low").length,
  };

  return {
    predictions,
    modelVersion: MODEL_VERSION,
    generatedAt,
    dataQuality: summarizeQuality([
      { label: { en: "weight", hi: "वज़न" }, questionable: weight.questionable, invalid: weight.invalid },
      { label: { en: "blood pressure", hi: "BP" }, questionable: bp.questionable, invalid: bp.invalid },
      { label: { en: "step", hi: "कदम" }, questionable: activity.questionable, invalid: activity.invalid },
    ]),
  };
}

/**
 * Remember whether an insight was useful. Saved on this device only (no readings
 * in it, just the insight id and a thumbs up/down).
 */
export function submitInsightFeedback(insightId: string, patientId: string, isHelpful: boolean, reason?: string): void {
  const key = feedbackKey(patientId);
  const current = readLocalPref<InsightFeedback[]>(key, []);
  const entry: InsightFeedback = { insightId, patientId, isHelpful, reason, submittedAt: new Date().toISOString() };
  // One vote per insight: the latest wins.
  writeLocalPref(key, [entry, ...current.filter((f) => f.insightId !== insightId)].slice(0, 100));
}

/** Diagnostics for the developer panel: measured this session, never hard-coded. */
export function getMLDiagnostics(): MLDiagnostics {
  const pid = getActivePatientId();
  const feedback = pid ? readLocalPref<InsightFeedback[]>(feedbackKey(pid), []) : [];
  const avg = session.latenciesMs.length > 0 ? session.latenciesMs.reduce((a, b) => a + b, 0) / session.latenciesMs.length : null;
  return {
    modelVersion: MODEL_VERSION,
    modelType: "Robust statistics: Theil-Sen trend, median/MAD band",
    predictionCount: session.predictions,
    lastInferenceTime: session.lastAt,
    averageInferenceLatencyMs: avg === null ? null : Math.round(avg),
    confidenceDistribution: { ...session.lastConfidence },
    activePatientBaselines: session.patients.size,
    feedbackStats: {
      positive: feedback.filter((f) => f.isHelpful).length,
      negative: feedback.filter((f) => !f.isHelpful).length,
    },
  };
}
