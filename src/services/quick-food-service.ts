/**
 * Personalised quick-food list: learns a patient's own eating pattern from the
 * last 90 IST days of food logs (distinct days eaten, recency, weekly regularity,
 * quick-add use and meal context). Ranking lives in src/lib/analytics/food-calc.ts.
 *
 * "Hidden" foods and quick-add counters are per-device UI preferences (no readings),
 * keyed by patient so two patients on one device never mix.
 */
import { addDaysIST, todayIST } from "@/lib/health-rules";
import {
  DEFAULT_WEIGHTS,
  MIN_DISTINCT_DAYS_ELIGIBILITY,
  calculateQuickFoodScore,
  canonicalizeFoodName,
  rankQuickFoods,
  type QuickFoodCandidate,
  type QuickFoodScoreWeights,
} from "@/lib/analytics/food-calc";
import { readLocalPref, removeLocalPref, writeLocalPref } from "@/lib/utils";
import { getFoodLogsInRange } from "./patient-service";

export type PersonalizedQuickFoodItem = QuickFoodCandidate;
export type { QuickFoodScoreWeights };
export { DEFAULT_WEIGHTS, MIN_DISTINCT_DAYS_ELIGIBILITY, calculateQuickFoodScore, canonicalizeFoodName };

type QuickAddMap = Record<string, { count: number; lastUsed: string }>;

const hiddenKey = (patientId: string) => `swasthtrack_hidden_quick_foods_${patientId}`;
const usageKey = (patientId: string) => `swasthtrack_quick_add_usage_${patientId}`;

export function getHiddenQuickFoods(patientId: string): string[] {
  return readLocalPref<string[]>(hiddenKey(patientId), []);
}

export function hideQuickFood(patientId: string, foodName: string): void {
  const key = canonicalizeFoodName(foodName);
  if (!key) return;
  const current = getHiddenQuickFoods(patientId);
  if (!current.includes(key)) writeLocalPref(hiddenKey(patientId), [...current, key]);
}

export function unhideQuickFood(patientId: string, foodName: string): void {
  const key = canonicalizeFoodName(foodName);
  writeLocalPref(hiddenKey(patientId), getHiddenQuickFoods(patientId).filter((k) => k !== key));
}

export function recordQuickAddUsage(patientId: string, foodName: string): void {
  const key = canonicalizeFoodName(foodName);
  if (!key) return;
  const map = readLocalPref<QuickAddMap>(usageKey(patientId), {});
  const nowIso = new Date().toISOString();
  map[key] = { count: (map[key]?.count ?? 0) + 1, lastUsed: nowIso };
  writeLocalPref(usageKey(patientId), map);
}

/** Reset the personalised ranking without touching any food log. */
export function resetQuickFoodPreferences(patientId: string): void {
  removeLocalPref(usageKey(patientId));
  removeLocalPref(hiddenKey(patientId));
}

/** Quick foods for a patient, best first. Needs 3+ distinct days eaten, or 2+ quick-adds. */
export async function getPersonalizedQuickFoods(
  patientId: string,
  targetMealType?: string,
  limit = 8,
): Promise<PersonalizedQuickFoodItem[]> {
  const today = todayIST();
  const logs = await getFoodLogsInRange(patientId, addDaysIST(today, -89), today);
  return rankQuickFoods({
    logs,
    hiddenKeys: new Set(getHiddenQuickFoods(patientId)),
    quickAdd: readLocalPref<QuickAddMap>(usageKey(patientId), {}),
    targetMealType,
    limit,
  });
}
