/**
 * Activity & energy estimates.
 *
 * - What the user typed is kept exactly as typed and labelled "manual" (self-reported).
 * - Anything calculated is labelled an ESTIMATE, with a confidence and a plausible
 *   range, and says which inputs it assumed. A steps-only estimate is low confidence
 *   and never invents a single exact duration (it gives a cadence-based range).
 * - Method: MET x body weight x hours when a duration is known (walking ~3.3 MET,
 *   brisk ~3.8). This is total energy during the activity (it includes the resting
 *   share), not "extra" calories.
 */

export type ActivityAccuracyType = "actual" | "synced" | "estimated" | "manual";
export type ActivitySource = "manual" | "device_sync" | "estimated";
export type ActivityCalculationMethod =
  | "manual"
  | "device_sync"
  | "MET_based_estimate"
  | "distance_based_estimate"
  | "step_based_estimate"
  | "unknown";

export interface ActivityMeasurement {
  steps: number;
  durationMinutes: number | null; // null if not recorded
  distanceKm: number | null;
  activeCaloriesBurned: number | null; // null if not recorded
  totalDailyCalories?: number | null;
  source: ActivitySource;
  accuracyType: ActivityAccuracyType;
  calculationMethod: ActivityCalculationMethod;
  calculationVersion: string;
  confidence: "high" | "medium" | "low";
  isEstimate: boolean;
  durationRange?: { min: number; max: number };
  /** Plausible spread of an estimated calorie figure. */
  calorieRange?: { min: number; max: number };
  /** Body weight the estimate used, and whether it was the built-in default. */
  bodyWeightKg?: number;
  usedDefaultWeight?: boolean;
  notes?: string | null;
}

export interface ActivityEstimateParams {
  steps: number;
  /** The patient's real weight. When omitted a default is used and the result says so. */
  bodyWeightKg?: number;
  durationMinutes?: number | null;
  activityType?: "walking" | "brisk_walking" | "running" | "general";
}

/** Used only when no weight is supplied; always flagged in the result. */
export const DEFAULT_BODY_WEIGHT_KG = 72;
const MET_WALKING = 3.3;
const MET_BRISK = 3.8;
/** Walking cadence bounds (steps/min) used for the duration range. */
const CADENCE_MIN = 95;
const CADENCE_MAX = 125;
const KCAL_PER_STEP_AT_70KG = 0.04;

export interface ActivityEstimate {
  estimatedCalories: number;
  confidence: "high" | "medium" | "low";
  calculationMethod: ActivityCalculationMethod;
  explanation: string;
  durationRange?: { min: number; max: number };
  calorieRange: { min: number; max: number };
  bodyWeightKg: number;
  usedDefaultWeight: boolean;
}

export function estimateActiveCaloriesBurned(params: ActivityEstimateParams): ActivityEstimate {
  const steps = Number.isFinite(params.steps) && params.steps > 0 ? params.steps : 0;
  const hasWeight = typeof params.bodyWeightKg === "number" && Number.isFinite(params.bodyWeightKg) && params.bodyWeightKg > 20;
  const weight = hasWeight ? (params.bodyWeightKg as number) : DEFAULT_BODY_WEIGHT_KG;
  const weightNote = hasWeight ? `${weight} kg` : `${weight} kg (default: no weight on record)`;

  if (params.durationMinutes && params.durationMinutes > 0 && params.durationMinutes <= 24 * 60) {
    const hours = params.durationMinutes / 60;
    const met = params.activityType === "brisk_walking" ? MET_BRISK : MET_WALKING;
    const kcal = Math.round(met * weight * hours);
    return {
      estimatedCalories: kcal,
      confidence: hasWeight ? "medium" : "low",
      calculationMethod: "MET_based_estimate",
      explanation: `Estimate: ${met} MET x ${weightNote} x ${params.durationMinutes} min = about ${kcal} kcal (total energy during the walk; real value varies by person and pace).`,
      calorieRange: { min: Math.round(kcal * 0.75), max: Math.round(kcal * 1.25) },
      bodyWeightKg: weight,
      usedDefaultWeight: !hasWeight,
    };
  }

  // Steps only: neither duration nor pace was measured, so give a range, never a point measurement.
  const perStep = (weight / 70) * KCAL_PER_STEP_AT_70KG;
  const kcal = Math.round(steps * perStep);
  return {
    estimatedCalories: kcal,
    confidence: "low",
    calculationMethod: "step_based_estimate",
    explanation: `Rough estimate from ${steps.toLocaleString("en-IN")} steps (about ${perStep.toFixed(3)} kcal per step at ${weightNote}). Not measured.`,
    durationRange: { min: Math.round(steps / CADENCE_MAX), max: Math.round(steps / CADENCE_MIN) },
    calorieRange: { min: Math.round(kcal * 0.6), max: Math.round(kcal * 1.4) },
    bodyWeightKg: weight,
    usedDefaultWeight: !hasWeight,
  };
}

/**
 * Build the activity record to store. Values the user entered are preserved as
 * typed (labelled manual / self-reported); only missing calories are estimated.
 */
export function buildActivityRecord(params: {
  steps: number;
  durationMinutes?: number | null;
  distanceKm?: number | null;
  caloriesBurned?: number | null;
  bodyWeightKg?: number;
  source?: ActivitySource;
  notes?: string | null;
}): ActivityMeasurement {
  const steps = params.steps;
  const hasDuration = params.durationMinutes != null && params.durationMinutes > 0;
  const hasCalories = params.caloriesBurned != null && params.caloriesBurned > 0;
  const durationMinutes = hasDuration ? (params.durationMinutes as number) : null;

  if (hasCalories) {
    const synced = params.source === "device_sync";
    return {
      steps,
      durationMinutes,
      distanceKm: params.distanceKm ?? null,
      activeCaloriesBurned: params.caloriesBurned as number,
      source: params.source || "manual",
      accuracyType: synced ? "synced" : "manual",
      calculationMethod: synced ? "device_sync" : "manual",
      calculationVersion: "v2.1-as-entered",
      confidence: synced ? "high" : "medium",
      isEstimate: false,
      notes: params.notes,
    };
  }

  const est = estimateActiveCaloriesBurned({ steps, bodyWeightKg: params.bodyWeightKg, durationMinutes });
  return {
    steps,
    durationMinutes,
    distanceKm: params.distanceKm ?? null,
    activeCaloriesBurned: est.estimatedCalories,
    source: "estimated",
    accuracyType: "estimated",
    calculationMethod: est.calculationMethod,
    calculationVersion: "v2.1-transparent-estimate",
    confidence: est.confidence,
    isEstimate: true,
    durationRange: hasDuration ? undefined : est.durationRange,
    calorieRange: est.calorieRange,
    bodyWeightKg: est.bodyWeightKg,
    usedDefaultWeight: est.usedDefaultWeight,
    notes: params.notes,
  };
}
