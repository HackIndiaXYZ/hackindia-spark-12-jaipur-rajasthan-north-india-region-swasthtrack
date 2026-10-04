/**
 * Small pure helpers shared by the meal entry panel and the log editor, so a
 * tablespoon of oil is the same number of calories in both places.
 */

export const OIL_OPTIONS = [
  { id: "None", label: "बिना तेल", cal: 0 },
  { id: "1/2 tsp", label: "½ चम्मच", cal: 22 },
  { id: "1 tsp", label: "1 चम्मच", cal: 45 },
  { id: "2 tsp", label: "2 चम्मच", cal: 90 },
  { id: "1 tbsp", label: "1 बड़ा चम्मच", cal: 120 },
  { id: "Unknown", label: "पता नहीं", cal: 0 },
] as const;

export type OilId = (typeof OIL_OPTIONS)[number]["id"];

export function oilCalories(oil: string): number {
  return OIL_OPTIONS.find((o) => o.id === oil)?.cal ?? 0;
}

export const UNKNOWN_OIL_NOTE = "तेल की मात्रा पता नहीं है, इसलिए कैलोरी का अनुमान कम सटीक हो सकता है।";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saved foods and quick-food fallbacks have local ids; only catalogue rows may be linked as `food_item_id`. */
export function isCatalogueId(id: string | null | undefined): id is string {
  return Boolean(id && UUID_RE.test(id));
}

export type Confidence = "High" | "Medium" | "Low";

export const MEAL_SLOTS = [
  { id: "Breakfast", label: "नाश्ता", english: "Breakfast" },
  { id: "Mid-morning", label: "बीच का स्नैक", english: "Mid-morning" },
  { id: "Lunch", label: "दोपहर का खाना", english: "Lunch" },
  { id: "Evening snack", label: "शाम का स्नैक", english: "Evening snack" },
  { id: "Dinner", label: "रात का खाना", english: "Dinner" },
  { id: "Bedtime", label: "सोने से पहले", english: "Bedtime" },
] as const;

export const MEAL_ORDER: string[] = [...MEAL_SLOTS.map((m) => m.id), "Other"];

export function mealLabel(id: string): string {
  const slot = MEAL_SLOTS.find((m) => m.id === id);
  return slot ? `${slot.label} (${slot.english})` : "अन्य (Other)";
}
