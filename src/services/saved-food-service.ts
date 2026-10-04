/**
 * "Save as My Food": patient-specific food templates for 1-tap reuse.
 *
 * Stored per patient on this device only (it holds food definitions, no readings).
 * It starts empty: nothing is seeded, and deleting every entry leaves it empty.
 * Removing a saved food never touches historical food logs.
 */
import { canonicalizeFoodName, normalizeFoodName } from "@/lib/analytics/food-calc";
import { readLocalPref, writeLocalPref } from "@/lib/utils";

export interface SavedFoodItem {
  id: string;
  patient_id: string;
  name: string;
  normalized_name: string;
  default_quantity: number;
  default_unit: string;
  default_calories: number;
  default_protein: number;
  meal_context: string;
  created_at: string;
  updated_at: string;
}

export { normalizeFoodName };

const storageKey = (patientId: string) => `swasthtrack_saved_my_foods_${patientId}`;
/** Earlier builds pre-filled four sample foods for every patient; they were never the user's own. */
const LEGACY_SEED_PREFIX = "saved_seed_";

function readAll(patientId: string): SavedFoodItem[] {
  const stored = readLocalPref<SavedFoodItem[]>(storageKey(patientId), []);
  const cleaned = stored.filter((f) => !f.id.startsWith(LEGACY_SEED_PREFIX));
  if (cleaned.length !== stored.length) writeLocalPref(storageKey(patientId), cleaned);
  return cleaned;
}

export function getSavedFoods(patientId: string): SavedFoodItem[] {
  return readAll(patientId);
}

const nonNegative = (n: number | undefined, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : fallback;

/** Save (or update, matched by name) a custom food for future reuse. */
export function saveCustomFoodAsMyFood(
  patientId: string,
  food: {
    name: string;
    quantity?: number;
    unit?: string;
    calories: number;
    protein?: number;
    meal_context?: string;
  },
): SavedFoodItem {
  const all = readAll(patientId);
  const name = food.name.trim();
  const normalized = normalizeFoodName(name);
  const canonical = canonicalizeFoodName(name);
  const nowIso = new Date().toISOString();

  const existingIdx = all.findIndex(
    (f) => canonicalizeFoodName(f.name) === canonical || (normalized !== "" && f.normalized_name === normalized),
  );

  if (existingIdx >= 0) {
    const prev = all[existingIdx];
    const updated: SavedFoodItem = {
      ...prev,
      name,
      normalized_name: normalized,
      default_quantity: food.quantity && food.quantity > 0 ? food.quantity : prev.default_quantity || 1,
      default_unit: food.unit || prev.default_unit || "serving",
      default_calories: nonNegative(food.calories, prev.default_calories),
      default_protein: nonNegative(food.protein, prev.default_protein || 0),
      meal_context: food.meal_context || prev.meal_context || "Lunch",
      updated_at: nowIso,
    };
    all[existingIdx] = updated;
    writeLocalPref(storageKey(patientId), all);
    return updated;
  }

  const item: SavedFoodItem = {
    id: `saved_food_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    patient_id: patientId,
    name,
    normalized_name: normalized,
    default_quantity: food.quantity && food.quantity > 0 ? food.quantity : 1,
    default_unit: food.unit || "serving",
    default_calories: nonNegative(food.calories, 0),
    default_protein: nonNegative(food.protein, 0),
    meal_context: food.meal_context || "Lunch",
    created_at: nowIso,
    updated_at: nowIso,
  };
  writeLocalPref(storageKey(patientId), [item, ...all]);
  return item;
}

/** Remove a saved food. Historical food logs are not touched. */
export function removeSavedFood(patientId: string, savedFoodId: string): boolean {
  writeLocalPref(storageKey(patientId), readAll(patientId).filter((f) => f.id !== savedFoodId));
  return true;
}

/** Match by name (Hindi or English, punctuation-insensitive). An empty query returns everything. */
export function searchSavedFoods(patientId: string, query: string): SavedFoodItem[] {
  const all = readAll(patientId);
  const q = canonicalizeFoodName(query);
  if (!q) return all;
  return all.filter((f) => canonicalizeFoodName(f.name).includes(q) || f.normalized_name.includes(q));
}
