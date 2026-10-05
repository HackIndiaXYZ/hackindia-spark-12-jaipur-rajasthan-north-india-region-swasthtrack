import { foodEmoji } from "@/lib/food/emoji";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

/**
 * Per-device UI preferences (dismissed banners, hidden quick-foods, ...).
 * Not for health data: that lives in the database. Every access is guarded
 * because storage can be blocked (private mode) or full.
 */
export function readLocalPref<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocalPref<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the preference simply is not remembered.
  }
}

export function removeLocalPref(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Emoji for a food name (and optional category); the rules live in lib/food/emoji.ts. */
export function getExactFoodEmoji(foodName = "", category = ""): string {
  return foodEmoji(foodName, category);
}
