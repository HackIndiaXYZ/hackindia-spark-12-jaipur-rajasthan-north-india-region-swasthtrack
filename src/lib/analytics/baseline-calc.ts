/**
 * Personal baseline maths (pure). A "baseline" is the patient's own recent
 * pattern (median and a MAD-based range), used as context for anomalies and
 * forecasts. It is never a clinical target; targets live in health-rules.
 */
import {
  BASELINE_MIN_BP_READINGS,
  BASELINE_MIN_DAYS,
  WEIGHT_STABLE_KG,
  mean as meanOf,
  median as medianOf,
  stdDev as stdDevOf,
} from "../health-rules";
import type { AdherenceSummary } from "./adherence";

export type BaselineWindow = "7d" | "14d" | "30d" | "90d";

export const BASELINE_WINDOW_DAYS: Record<BaselineWindow, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 };

export interface MetricBaseline {
  metricName: string;
  isAvailable: boolean;
  observationCount: number;
  mean?: number;
  median?: number;
  min?: number;
  max?: number;
  stdDev?: number;
  /** Median absolute deviation (raw, not scaled). */
  mad?: number;
  personalPatternRange?: {
    low: number;
    high: number;
    formatted: string;
  };
  unit: string;
  window: BaselineWindow;
  note?: string;
  noteHi?: string;
}

export interface BaselineStats {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  mad: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Robust statistics for a list of numbers (all zeros for an empty list). */
export function calculateStats(values: number[]): BaselineStats {
  if (values.length === 0) return { mean: 0, median: 0, min: 0, max: 0, stdDev: 0, mad: 0 };
  const med = medianOf(values) as number;
  const mad = medianOf(values.map((v) => Math.abs(v - med))) as number;
  return {
    mean: r1(meanOf(values) as number),
    median: r1(med),
    min: Math.min(...values),
    max: Math.max(...values),
    stdDev: r1(stdDevOf(values) ?? 0),
    mad: r1(mad),
  };
}

function unavailable(
  metricName: string,
  unit: string,
  window: BaselineWindow,
  count: number,
  need: number,
): MetricBaseline {
  return {
    metricName,
    isAvailable: false,
    observationCount: count,
    unit,
    window,
    note: `Not enough data yet (${count} of ${need} needed)`,
    noteHi: `अभी पर्याप्त डेटा नहीं है (${count} / ${need})`,
  };
}

function ranged(
  metricName: string,
  unit: string,
  window: BaselineWindow,
  values: number[],
  halfWidth: (s: BaselineStats) => number,
  opts: { decimals?: number; floor?: number; noteEn?: string; noteHi?: string } = {},
): MetricBaseline {
  const s = calculateStats(values);
  const w = halfWidth(s);
  const d = opts.decimals ?? 0;
  const f = 10 ** d;
  const low = Math.max(opts.floor ?? 0, Math.round((s.median - w) * f) / f);
  const high = Math.round((s.median + w) * f) / f;
  const fmt = (n: number) => (d === 0 ? Math.round(n).toLocaleString("en-IN") : n.toFixed(d));
  return {
    metricName,
    isAvailable: true,
    observationCount: values.length,
    ...s,
    personalPatternRange: { low, high, formatted: `${fmt(low)}–${fmt(high)} ${unit}` },
    unit,
    window,
    note: opts.noteEn,
    noteHi: opts.noteHi,
  };
}

export interface BaselineInput {
  window: BaselineWindow;
  bp: Array<{ systolic: number; diastolic: number; pulse: number | null }>;
  weights: number[];
  /** Per COMPLETE day (today's partial intake is excluded by the caller). */
  dailyCalories: number[];
  steps: number[];
  sleepHours: number[];
  adherence: AdherenceSummary;
}

export interface BaselineMetrics {
  systolicBP: MetricBaseline;
  diastolicBP: MetricBaseline;
  pulse: MetricBaseline;
  weight: MetricBaseline;
  dailyCalories: MetricBaseline;
  dailySteps: MetricBaseline;
  sleepDuration: MetricBaseline;
  medicineAdherence: MetricBaseline;
}

export function computeBaselineMetrics(input: BaselineInput): BaselineMetrics {
  const w = input.window;
  const sys = input.bp.map((b) => b.systolic);
  const dia = input.bp.map((b) => b.diastolic);
  const pulses = input.bp.map((b) => b.pulse).filter((p): p is number => p !== null && p > 0);

  const systolicBP =
    sys.length >= BASELINE_MIN_BP_READINGS
      ? ranged("Systolic Blood Pressure", "mmHg", w, sys, (s) => Math.max(4, s.mad * 1.5), {
          noteEn: "Your recent personal systolic range (not a target)",
          noteHi: "आपका हाल का सिस्टोलिक पैटर्न (यह लक्ष्य नहीं है)",
        })
      : unavailable("Systolic Blood Pressure", "mmHg", w, sys.length, BASELINE_MIN_BP_READINGS);

  const diastolicBP =
    dia.length >= BASELINE_MIN_BP_READINGS
      ? ranged("Diastolic Blood Pressure", "mmHg", w, dia, (s) => Math.max(3, s.mad * 1.5), {
          noteEn: "Your recent personal diastolic range (not a target)",
          noteHi: "आपका हाल का डायस्टोलिक पैटर्न (यह लक्ष्य नहीं है)",
        })
      : unavailable("Diastolic Blood Pressure", "mmHg", w, dia.length, BASELINE_MIN_BP_READINGS);

  const pulse =
    pulses.length >= BASELINE_MIN_BP_READINGS
      ? ranged("Heart Rate / Pulse", "bpm", w, pulses, (s) => Math.max(3, s.mad * 1.5))
      : unavailable("Heart Rate / Pulse", "bpm", w, pulses.length, BASELINE_MIN_BP_READINGS);

  const weight =
    input.weights.length >= BASELINE_MIN_DAYS
      ? ranged("Weight", "kg", w, input.weights, (s) => Math.max(WEIGHT_STABLE_KG, s.mad), {
          decimals: 1,
          noteEn: "Recent weight range",
          noteHi: "हाल का वज़न पैटर्न",
        })
      : unavailable("Weight", "kg", w, input.weights.length, BASELINE_MIN_DAYS);

  const dailyCalories =
    input.dailyCalories.length >= BASELINE_MIN_DAYS
      ? ranged("Daily Calories", "kcal", w, input.dailyCalories, (s) => Math.max(100, s.mad))
      : unavailable("Daily Calories", "kcal", w, input.dailyCalories.length, BASELINE_MIN_DAYS);

  const dailySteps =
    input.steps.length >= BASELINE_MIN_DAYS
      ? ranged("Daily Steps", "steps", w, input.steps, (s) => Math.max(500, s.mad))
      : unavailable("Daily Steps", "steps", w, input.steps.length, BASELINE_MIN_DAYS);

  const sleepDuration =
    input.sleepHours.length >= BASELINE_MIN_DAYS
      ? ranged("Sleep Duration", "hours", w, input.sleepHours, (s) => Math.max(0.5, s.mad), { decimals: 1, floor: 0 })
      : unavailable("Sleep Duration", "hours", w, input.sleepHours.length, BASELINE_MIN_DAYS);

  const a = input.adherence;
  const medicineAdherence: MetricBaseline =
    a.evaluated > 0 && a.pct !== null
      ? {
          metricName: "Medicine Adherence",
          isAvailable: true,
          observationCount: a.evaluated,
          mean: a.pct,
          median: a.pct,
          unit: "%",
          window: w,
          note: `${a.adherent} of ${a.evaluated} due doses taken (taken + late)`,
          noteHi: `समय आ चुकी ${a.evaluated} खुराकों में से ${a.adherent} ली गईं`,
        }
      : unavailable("Medicine Adherence", "%", w, a.evaluated, 1);

  return { systolicBP, diastolicBP, pulse, weight, dailyCalories, dailySteps, sleepDuration, medicineAdherence };
}
