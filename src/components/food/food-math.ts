/**
 * Small pure helpers shared by the meal entry panel and the log editor, so a
 * tablespoon of oil is the same number of calories in both places.
 */
import { istHour, istInstant } from "@/lib/health-rules";

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

/** The four meals of a normal day. They always show on the log, even empty, so a gap is visible. */
export const MAIN_MEALS: readonly string[] = ["Breakfast", "Lunch", "Evening snack", "Dinner"];

/** A typical India clock time ("HH:MM") for each slot, used when a meal is added to a past day. */
export const MEAL_DEFAULT_HHMM: Record<string, string> = {
  Breakfast: "08:00",
  "Mid-morning": "11:00",
  Lunch: "13:30",
  "Evening snack": "17:30",
  Dinner: "20:30",
  Bedtime: "22:30",
  Other: "12:00",
};

/**
 * When a meal logged for `dateIST` was eaten: right now for today, otherwise the
 * slot's typical time on that day (we cannot know the real one), so it lands on
 * the day the reader is looking at.
 */
export function consumedAtFor(dateIST: string, mealType: string, today: string, now: Date = new Date()): string {
  if (dateIST >= today) return now.toISOString();
  const hhmm = MEAL_DEFAULT_HHMM[mealType] ?? MEAL_DEFAULT_HHMM.Other;
  return istInstant(dateIST, hhmm).toISOString();
}

export function mealLabel(id: string): string {
  const slot = MEAL_SLOTS.find((m) => m.id === id);
  return slot ? `${slot.label} (${slot.english})` : "अन्य (Other)";
}

/** The food search box; the page focuses it when a meal card's "add" button is pressed. */
export const SEARCH_INPUT_ID = "food-search-input";
/** The whole entry panel, as a scroll target. */
export const ENTRY_PANEL_ID = "food-entry";

/** Slot for the current India time, so the right meal is pre-selected (the reader can change it). */
export function mealSlotNow(now: Date = new Date()): string {
  const hour = istHour(now);
  if (hour >= 6 && hour < 10) return "Breakfast";
  if (hour >= 10 && hour < 12) return "Mid-morning";
  if (hour >= 12 && hour < 16) return "Lunch";
  if (hour >= 16 && hour < 19) return "Evening snack";
  if (hour >= 19 && hour < 22) return "Dinner";
  return "Bedtime";
}
