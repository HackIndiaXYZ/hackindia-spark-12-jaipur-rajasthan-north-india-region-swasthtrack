/**
 * Food-name normalisation and the personalised quick-food ranking (pure).
 */
import { ageInDays } from "./dates";
import { eachIST, toISTDate, todayIST } from "../health-rules";

/**
 * Stable key for a food name. Unicode-aware: Devanagari letters, digits and
 * combining marks (matras, nukta, virama) are kept, so a Hindi name never turns
 * into an empty string or collapses to just its quantity.
 *   "Wheat Roti (गेहूं की रोटी)"  -> "wheat roti"
 *   "गेहूं की रोटी"                -> "गेहूं की रोटी"
 *   "2 गेहूं की रोटी + दाल"        -> "2 गेहूं की रोटी दाल"
 */
export function canonicalizeFoodName(name: string): string {
  if (!name) return "";
  const clean = (s: string) =>
    s
      .normalize("NFC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  const withoutParens = clean(name.replace(/\(.*?\)/g, " "));
  // A name that is only a parenthesised part ("(दाल)") keeps that part.
  return withoutParens || clean(name);
}

const ALIASES: Array<[string[], string]> = [
  [["chapati", "chapatti", "phulka", "roti", "रोटी", "चपाती", "फुल्का", "गेहूं की रोटी"], "roti"],
  [["dhal", "daal", "dal", "दाल"], "dal"],
  [["doodh", "milk", "दूध"], "milk"],
  [["chaas", "mattha", "buttermilk", "छाछ", "मट्ठा"], "buttermilk"],
  [["khichdi", "khichri", "खिचड़ी"], "khichdi"],
];

/** Group common spellings of the same everyday food (used for "My Foods" duplicate detection). */
export function normalizeFoodName(name: string): string {
  const key = canonicalizeFoodName(name);
  for (const [variants, canonical] of ALIASES) if (variants.includes(key)) return canonical;
  return key;
}

// ---------------------------------------------------------------------------
// Quick-food ranking
// ---------------------------------------------------------------------------

export interface QuickFoodScoreWeights {
  frequency: number;
  recency: number;
  consistency: number;
  quickAdd: number;
  mealContext: number;
}

export const DEFAULT_WEIGHTS: QuickFoodScoreWeights = {
  frequency: 0.4,
  recency: 0.2,
  consistency: 0.2,
  quickAdd: 0.1,
  mealContext: 0.1,
};

export const MIN_DISTINCT_DAYS_ELIGIBILITY = 3;

export function calculateQuickFoodScore(params: {
  distinctDays7d: number;
  distinctDays30d: number;
  distinctDays90d: number;
  /** Days since the food was last eaten (fractional). */
  daysSinceLast: number;
  weeklyActiveCount: number; // 0..4 active weeks in the past 28 days
  quickAddUsageCount: number;
  mealContextCount: number;
  totalEntries: number;
  weights?: QuickFoodScoreWeights;
}): number {
  const w = params.weights || DEFAULT_WEIGHTS;
  const freq30 = Math.min(1, params.distinctDays30d / 15);
  const freq7 = Math.min(1, params.distinctDays7d / 5);
  const frequency = 0.7 * freq30 + 0.3 * freq7;
  const recency = Math.exp(-Math.max(0, params.daysSinceLast) / 14);
  const consistency = Math.min(1, params.weeklyActiveCount / 4);
  const quickAdd = Math.min(1, params.quickAddUsageCount / 8);
  const mealContext = params.totalEntries > 0 ? Math.min(1, (params.mealContextCount / params.totalEntries) * 1.5) : 0;
  const score =
    w.frequency * frequency + w.recency * recency + w.consistency * consistency + w.quickAdd * quickAdd + w.mealContext * mealContext;
  return Math.round(score * 1000) / 1000;
}

export interface QuickFoodLog {
  food_name: string;
  calories: number | null;
  consumed_at: string;
  meal_type: string | null;
}

export interface QuickFoodCandidate {
  canonicalKey: string;
  name: string;
  name_hi: string | null;
  category: string;
  /** Average of the logged non-zero calories; 0 when none was ever recorded (see caloriesKnown). */
  defaultCal: number;
  caloriesKnown: boolean;
  distinctDays7d: number;
  distinctDays30d: number;
  distinctDays90d: number;
  lastConsumedAt: string;
  quickAddUsageCount: number;
  score: number;
  mealContextFrequency: Record<string, number>;
  isManuallyHidden: boolean;
}

export function rankQuickFoods(input: {
  logs: QuickFoodLog[];
  hiddenKeys: Set<string>;
  quickAdd: Record<string, { count: number; lastUsed: string }>;
  targetMealType?: string;
  limit: number;
  now?: Date;
}): QuickFoodCandidate[] {
  const now = input.now ?? new Date();
  const today = todayIST(now);

  interface Agg {
    key: string;
    nameEn: string;
    nameHi: string | null;
    calories: number[];
    d7: Set<string>;
    d30: Set<string>;
    d90: Set<string>;
    weeks: Set<number>;
    last: string;
    meals: Record<string, number>;
    entries: number;
  }
  const map = new Map<string, Agg>();

  for (const log of input.logs) {
    const key = canonicalizeFoodName(log.food_name);
    if (!key) continue;
    const day = toISTDate(log.consumed_at);
    const age = ageInDays(day, today);
    if (age < 0 || age >= 90) continue;

    let agg = map.get(key);
    if (!agg) {
      const m = log.food_name.match(/^(.*?)\s*\((.*?)\)$/);
      agg = {
        key,
        nameEn: m && m[1].trim() ? m[1].trim() : log.food_name.trim(),
        nameHi: m ? m[2].trim() : null,
        calories: [],
        d7: new Set(),
        d30: new Set(),
        d90: new Set(),
        weeks: new Set(),
        last: log.consumed_at,
        meals: {},
        entries: 0,
      };
      map.set(key, agg);
    }
    agg.entries++;
    if ((log.calories ?? 0) > 0) agg.calories.push(log.calories as number);
    if (new Date(log.consumed_at) > new Date(agg.last)) agg.last = log.consumed_at;
    agg.d90.add(day);
    if (age < 30) agg.d30.add(day);
    if (age < 7) agg.d7.add(day);
    if (age < 28) agg.weeks.add(Math.floor(age / 7));
    const meal = log.meal_type || "Other";
    agg.meals[meal] = (agg.meals[meal] || 0) + 1;
  }

  const out: QuickFoodCandidate[] = [];
  const target = input.targetMealType?.toLowerCase();
  for (const agg of map.values()) {
    if (input.hiddenKeys.has(agg.key)) continue;
    const qa = input.quickAdd[agg.key]?.count ?? 0;
    if (agg.d90.size < MIN_DISTINCT_DAYS_ELIGIBILITY && qa < 2) continue;

    const mealCount = target
      ? Object.entries(agg.meals).reduce((s, [k, v]) => (k.toLowerCase() === target ? s + v : s), 0)
      : 0;
    const daysSinceLast = (now.getTime() - new Date(agg.last).getTime()) / 86_400_000;
    out.push({
      canonicalKey: agg.key,
      name: agg.nameEn,
      name_hi: agg.nameHi,
      category: "food",
      defaultCal: agg.calories.length ? Math.round(agg.calories.reduce((a, b) => a + b, 0) / agg.calories.length) : 0,
      caloriesKnown: agg.calories.length > 0,
      distinctDays7d: agg.d7.size,
      distinctDays30d: agg.d30.size,
      distinctDays90d: agg.d90.size,
      lastConsumedAt: agg.last,
      quickAddUsageCount: qa,
      score: calculateQuickFoodScore({
        distinctDays7d: agg.d7.size,
        distinctDays30d: agg.d30.size,
        distinctDays90d: agg.d90.size,
        daysSinceLast,
        weeklyActiveCount: agg.weeks.size,
        quickAddUsageCount: qa,
        mealContextCount: mealCount,
        totalEntries: agg.entries,
      }),
      mealContextFrequency: agg.meals,
      isManuallyHidden: false,
    });
  }

  out.sort(
    (a, b) =>
      b.score - a.score ||
      new Date(b.lastConsumedAt).getTime() - new Date(a.lastConsumedAt).getTime() ||
      b.distinctDays30d - a.distinctDays30d,
  );
  return out.slice(0, input.limit);
}

// ---------------------------------------------------------------------------
// Daily totals, macro split and history (pure)
// ---------------------------------------------------------------------------

export interface FoodLogTotalsInput {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  consumed_at: string;
}

export interface FoodTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  /** Number of logged items. */
  entries: number;
}

export interface FoodDayTotals extends FoodTotals {
  /** IST calendar date. */
  date: string;
}

const num = (v: number | null | undefined): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function sumFoodLogs(logs: Array<Omit<FoodLogTotalsInput, "consumed_at">>): FoodTotals {
  const t: FoodTotals = { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, entries: 0 };
  for (const l of logs) {
    t.calories += num(l.calories);
    t.protein += num(l.protein_g);
    t.carbs += num(l.carbs_g);
    t.fat += num(l.fat_g);
    t.fibre += num(l.fibre_g);
    t.entries += 1;
  }
  return t;
}

/** One row per IST date in [startDate, endDate], zero-filled, oldest first. Logs outside the window are ignored. */
export function aggregateFoodByDay(logs: FoodLogTotalsInput[], startDate: string, endDate: string): FoodDayTotals[] {
  const byDate = new Map<string, FoodLogTotalsInput[]>();
  for (const l of logs) {
    const d = toISTDate(l.consumed_at);
    const list = byDate.get(d);
    if (list) list.push(l);
    else byDate.set(d, [l]);
  }
  return eachIST(startDate, endDate).map((date) => ({ date, ...sumFoodLogs(byDate.get(date) ?? []) }));
}

export interface MacroSplit {
  /** kcal each macro contributes (Atwater 4 / 4 / 9). */
  proteinKcal: number;
  carbsKcal: number;
  fatKcal: number;
  /** Whole-number shares of the macro kcal that add up to 100 (all 0 when nothing is logged). */
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
}

/**
 * Share of energy from protein / carbs / fat. Shares come from the macro grams,
 * not from the logged calories (which also include oil and hand-typed values), so
 * they always add up to 100.
 */
export function macroSplit(t: Pick<FoodTotals, "protein" | "carbs" | "fat">): MacroSplit {
  const proteinKcal = t.protein * 4;
  const carbsKcal = t.carbs * 4;
  const fatKcal = t.fat * 9;
  const total = proteinKcal + carbsKcal + fatKcal;
  if (total <= 0) return { proteinKcal, carbsKcal, fatKcal, proteinPct: 0, carbsPct: 0, fatPct: 0 };
  const proteinPct = Math.round((proteinKcal / total) * 100);
  const fatPct = Math.round((fatKcal / total) * 100);
  return { proteinKcal, carbsKcal, fatKcal, proteinPct, fatPct, carbsPct: Math.max(0, 100 - proteinPct - fatPct) };
}

export interface FoodHistorySummary {
  /** Days in the window that have at least one entry. */
  loggedDays: number;
  /** Logged days that are finished (before `today`); today is still being filled in. */
  completedLoggedDays: number;
  /** Mean kcal over completed logged days, or today's total when it is the only logged day; null when nothing is logged. */
  avgCalories: number | null;
  /** Mean protein (g) over the same days. */
  avgProtein: number | null;
  /** Completed logged days at or under the target. */
  withinTarget: number;
  /** Completed logged days over the target. */
  overTarget: number;
}

export function summarizeFoodHistory(days: FoodDayTotals[], target: number, today: string): FoodHistorySummary {
  const logged = days.filter((d) => d.entries > 0);
  const completed = logged.filter((d) => d.date < today);
  const basis = completed.length > 0 ? completed : logged;
  const mean = (pick: (d: FoodDayTotals) => number) =>
    basis.length > 0 ? Math.round(basis.reduce((s, d) => s + pick(d), 0) / basis.length) : null;
  return {
    loggedDays: logged.length,
    completedLoggedDays: completed.length,
    avgCalories: mean((d) => d.calories),
    avgProtein: mean((d) => d.protein),
    withinTarget: completed.filter((d) => d.calories <= target).length,
    overTarget: completed.filter((d) => d.calories > target).length,
  };
}
