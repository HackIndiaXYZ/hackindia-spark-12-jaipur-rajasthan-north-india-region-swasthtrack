/**
 * Fact ledger: the "exactness" engine. PURE.
 *
 * Every number SOIE may state about the patient is computed HERE, from the
 * loaded `PatientContext`, with an explicit window and sample size. The model
 * never calculates; it cites ledger facts (ids) and record refs. verify.ts
 * rejects any number that did not come from here (or from a tool built on these
 * same functions).
 *
 * Window helpers (`bpStats`, `weightStats`, ...) take any [from, to] IST range
 * so the query tools and the rules engine reuse exactly the same maths.
 */

import {
  DEFAULT_STEP_GOAL,
  MEDICINE_LATE_AFTER_MIN,
  SLEEP_LONG_HOURS,
  SLEEP_SHORT_HOURS,
  SODIUM_IDEAL_MG_PER_DAY,
  SODIUM_LIMIT_MG_PER_DAY,
  WEIGHT_RAPID_KG_7D,
  WEIGHT_RAPID_PCT_30D,
  adherencePct,
  addDaysIST,
  calcBMI,
  classifyBMI,
  classifyBP,
  classifyPulse,
  daysBetweenIST,
  dayPartIST,
  linearSlope,
  mean,
  median,
  pearson,
  round,
  stdDev,
} from "@/lib/health-rules";
import type {
  ActivityRecord,
  BPRecord,
  DoseRecord,
  Fact,
  FactWindow,
  FoodRecord,
  Ledger,
  LedgerFlag,
  Metric,
  PatientContext,
  SleepRecord,
  WeightRecord,
} from "./types";

/** Minimum readings before a trend slope or association is reported at all. */
export const MIN_TREND_N = 5;
export const MIN_ASSOCIATION_PAIRS = 10;

const MS_DAY = 86_400_000;

export const WINDOWS = [
  { key: "today", days: 1, en: "today", hi: "आज" },
  { key: "7d", days: 7, en: "last 7 days", hi: "पिछले 7 दिन" },
  { key: "14d", days: 14, en: "last 14 days", hi: "पिछले 14 दिन" },
  { key: "30d", days: 30, en: "last 30 days", hi: "पिछले 30 दिन" },
  { key: "90d", days: 90, en: "last 90 days", hi: "पिछले 90 दिन" },
] as const;

export function inRange<T extends { date: string }>(rows: T[], from: string, to: string): T[] {
  return rows.filter((r) => r.date >= from && r.date <= to);
}

function r1(n: number | null): number | null {
  return n === null ? null : round(n, 1);
}
function r0(n: number | null): number | null {
  return n === null ? null : Math.round(n);
}
function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

// ---------------------------------------------------------------------------
// Blood pressure
// ---------------------------------------------------------------------------

export interface BPStats {
  from: string;
  to: string;
  n: number;
  daysWithReadings: number;
  meanSys: number | null;
  meanDia: number | null;
  medianSys: number | null;
  medianDia: number | null;
  highest: { systolic: number; diastolic: number; ref: string; date: string } | null;
  lowest: { systolic: number; diastolic: number; ref: string; date: string } | null;
  sdSys: number | null;
  sdDia: number | null;
  /** mmHg per week, least squares; null with fewer than MIN_TREND_N readings on 3+ days. */
  trendSysPerWeek: number | null;
  trendDiaPerWeek: number | null;
  nAboveTarget: number;
  nAlert: number;
  nCrisis: number;
  nLow: number;
  pctAboveTarget: number | null;
  pctAlert: number | null;
  morning: { n: number; meanSys: number | null; meanDia: number | null };
  evening: { n: number; meanSys: number | null; meanDia: number | null };
  pulse: { n: number; mean: number | null; min: number | null; max: number | null; nHigh: number; nLow: number };
  refs: string[];
}

export function bpStats(records: BPRecord[], from: string, to: string, thresholds: PatientContext["goals"]["bp"]): BPStats {
  const rows = inRange(records, from, to);
  const sys = rows.map((r) => r.systolic);
  const dia = rows.map((r) => r.diastolic);
  const days = new Set(rows.map((r) => r.date));

  let highest: BPStats["highest"] = null;
  let lowest: BPStats["lowest"] = null;
  for (const r of rows) {
    if (!highest || r.systolic > highest.systolic || (r.systolic === highest.systolic && r.diastolic > highest.diastolic)) {
      highest = { systolic: r.systolic, diastolic: r.diastolic, ref: r.ref, date: r.date };
    }
    if (!lowest || r.systolic < lowest.systolic || (r.systolic === lowest.systolic && r.diastolic < lowest.diastolic)) {
      lowest = { systolic: r.systolic, diastolic: r.diastolic, ref: r.ref, date: r.date };
    }
  }

  const t0 = new Date(`${from}T00:00:00+05:30`).getTime();
  const trendOk = rows.length >= MIN_TREND_N && days.size >= 3;
  const slopeOf = (pick: (r: BPRecord) => number) =>
    trendOk ? linearSlope(rows.map((r) => ({ x: (new Date(r.at).getTime() - t0) / MS_DAY, y: pick(r) }))) : null;
  const sSys = slopeOf((r) => r.systolic);
  const sDia = slopeOf((r) => r.diastolic);

  let nAbove = 0;
  let nAlert = 0;
  let nCrisis = 0;
  let nLow = 0;
  for (const r of rows) {
    const c = classifyBP(r.systolic, r.diastolic, thresholds);
    if (c.aboveTarget) nAbove++;
    if (c.exceedsAlert) nAlert++;
    if (c.category === "crisis") nCrisis++;
    if (c.category === "low") nLow++;
  }

  const part = (p: "morning" | "evening") => {
    const sub = rows.filter((r) => dayPartIST(r.at) === p);
    return { n: sub.length, meanSys: r1(mean(sub.map((r) => r.systolic))), meanDia: r1(mean(sub.map((r) => r.diastolic))) };
  };

  const pulses = rows.filter((r) => r.pulse !== null).map((r) => r.pulse as number);
  const pulseCls = pulses.map((p) => classifyPulse(p).category);

  return {
    from,
    to,
    n: rows.length,
    daysWithReadings: days.size,
    meanSys: r1(mean(sys)),
    meanDia: r1(mean(dia)),
    medianSys: r1(median(sys)),
    medianDia: r1(median(dia)),
    highest,
    lowest,
    sdSys: r1(stdDev(sys)),
    sdDia: r1(stdDev(dia)),
    trendSysPerWeek: sSys === null ? null : round(sSys * 7, 1),
    trendDiaPerWeek: sDia === null ? null : round(sDia * 7, 1),
    nAboveTarget: nAbove,
    nAlert,
    nCrisis,
    nLow,
    pctAboveTarget: pct(nAbove, rows.length),
    pctAlert: pct(nAlert, rows.length),
    morning: part("morning"),
    evening: part("evening"),
    pulse: {
      n: pulses.length,
      mean: r1(mean(pulses)),
      min: pulses.length ? Math.min(...pulses) : null,
      max: pulses.length ? Math.max(...pulses) : null,
      nHigh: pulseCls.filter((c) => c === "high").length,
      nLow: pulseCls.filter((c) => c === "low").length,
    },
    refs: rows.map((r) => r.ref),
  };
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export interface WeightStats {
  from: string;
  to: string;
  n: number;
  first: { kg: number; date: string; ref: string } | null;
  last: { kg: number; date: string; ref: string } | null;
  changeKg: number | null;
  meanKg: number | null;
  minKg: number | null;
  maxKg: number | null;
  /** kg per week, least squares; needs MIN_TREND_N points spanning 7+ days. */
  trendPerWeek: number | null;
  refs: string[];
}

export function weightStats(records: WeightRecord[], from: string, to: string): WeightStats {
  const rows = inRange(records, from, to);
  const first = rows[0] ?? null;
  const last = rows[rows.length - 1] ?? null;
  const t0 = new Date(`${from}T00:00:00+05:30`).getTime();
  const spanDays = first && last ? daysBetweenIST(first.date, last.date) : 0;
  const slope =
    rows.length >= MIN_TREND_N && spanDays >= 7
      ? linearSlope(rows.map((r) => ({ x: (new Date(r.at).getTime() - t0) / MS_DAY, y: r.kg })))
      : null;
  const kgs = rows.map((r) => r.kg);
  return {
    from,
    to,
    n: rows.length,
    first: first ? { kg: first.kg, date: first.date, ref: first.ref } : null,
    last: last ? { kg: last.kg, date: last.date, ref: last.ref } : null,
    changeKg: first && last && rows.length >= 2 ? round(last.kg - first.kg, 1) : null,
    meanKg: r1(mean(kgs)),
    minKg: kgs.length ? Math.min(...kgs) : null,
    maxKg: kgs.length ? Math.max(...kgs) : null,
    trendPerWeek: slope === null ? null : round(slope * 7, 2),
    refs: rows.map((r) => r.ref),
  };
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export interface DayNutrition {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  /** Sum over items that carry sodium data (a lower bound when coverage < 100%). */
  sodium_mg: number;
  items: number;
  itemsWithSodium: number;
}

export interface NutritionStats {
  from: string;
  to: string;
  windowDays: number;
  daysLogged: number;
  items: number;
  perDay: DayNutrition[];
  meanCalories: number | null;
  meanProtein: number | null;
  meanCarbs: number | null;
  meanFat: number | null;
  meanFibre: number | null;
  meanSodium: number | null;
  sodiumCoveragePct: number | null;
  calorieTarget: number;
  /** Mean calories as a % of target (logged days only). */
  pctOfTarget: number | null;
  daysAboveTarget: number;
  daysBelow70PctTarget: number;
  byMeal: Array<{ meal: string; meanCalories: number; items: number }>;
  topFoodsByCount: Array<{ name: string; count: number; calories: number }>;
  topFoodsByCalories: Array<{ name: string; count: number; calories: number }>;
  oilyEntries: { count: number; days: number; examples: string[] };
  refs: string[];
}

const OILY = /\b(oil|ghee|butter|fry|fried|deep\s*fried|tali|tala|talli|pakod\w*|puri|poori|paratha|parantha|samosa|kachori|bhatura|jalebi|vada|bhajiya|bhaji|namkeen|chips|fries)\b|तेल|घी|मक्खन|तला|तली|तले|पकौड|पूरी|पराठ|समोसा|कचौरी|भटूरा|जलेबी|वड़ा|भजिया|नमकीन/i;

export function dailyNutrition(records: FoodRecord[], from: string, to: string): DayNutrition[] {
  const by = new Map<string, DayNutrition>();
  for (const r of inRange(records, from, to)) {
    const d =
      by.get(r.date) ??
      { date: r.date, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0, sodium_mg: 0, items: 0, itemsWithSodium: 0 };
    d.calories += r.calories;
    d.protein_g += r.protein_g;
    d.carbs_g += r.carbs_g;
    d.fat_g += r.fat_g;
    d.fibre_g += r.fibre_g;
    d.items += 1;
    if (r.sodium_mg !== null) {
      d.sodium_mg += r.sodium_mg;
      d.itemsWithSodium += 1;
    }
    by.set(r.date, d);
  }
  return Array.from(by.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      calories: round(d.calories, 0),
      protein_g: round(d.protein_g, 1),
      carbs_g: round(d.carbs_g, 1),
      fat_g: round(d.fat_g, 1),
      fibre_g: round(d.fibre_g, 1),
      sodium_mg: round(d.sodium_mg, 0),
    }));
}

export function nutritionStats(records: FoodRecord[], from: string, to: string, calorieTarget: number): NutritionStats {
  const rows = inRange(records, from, to);
  const perDay = dailyNutrition(records, from, to);
  const nDays = perDay.length;

  const meanOf = (pick: (d: DayNutrition) => number) => (nDays ? r1(mean(perDay.map(pick))) : null);
  const meanCal = nDays ? r0(mean(perDay.map((d) => d.calories))) : null;

  const mealMap = new Map<string, { cal: number; items: number }>();
  for (const r of rows) {
    const m = mealMap.get(r.meal) ?? { cal: 0, items: 0 };
    m.cal += r.calories;
    m.items += 1;
    mealMap.set(r.meal, m);
  }

  const foodMap = new Map<string, { name: string; count: number; calories: number }>();
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    const f = foodMap.get(key) ?? { name: r.name.trim(), count: 0, calories: 0 };
    f.count += 1;
    f.calories += r.calories;
    foodMap.set(key, f);
  }
  const foods = Array.from(foodMap.values()).map((f) => ({ ...f, calories: Math.round(f.calories) }));

  const oily = rows.filter((r) => OILY.test(r.name));
  const itemsWithSodium = rows.filter((r) => r.sodium_mg !== null).length;

  return {
    from,
    to,
    windowDays: daysBetweenIST(from, to) + 1,
    daysLogged: nDays,
    items: rows.length,
    perDay,
    meanCalories: meanCal,
    meanProtein: meanOf((d) => d.protein_g),
    meanCarbs: meanOf((d) => d.carbs_g),
    meanFat: meanOf((d) => d.fat_g),
    meanFibre: meanOf((d) => d.fibre_g),
    meanSodium: nDays && itemsWithSodium > 0 ? r0(mean(perDay.map((d) => d.sodium_mg))) : null,
    sodiumCoveragePct: pct(itemsWithSodium, rows.length),
    calorieTarget,
    pctOfTarget: meanCal !== null && calorieTarget > 0 ? Math.round((meanCal / calorieTarget) * 100) : null,
    daysAboveTarget: perDay.filter((d) => d.calories > calorieTarget).length,
    daysBelow70PctTarget: perDay.filter((d) => d.calories < calorieTarget * 0.7).length,
    byMeal: Array.from(mealMap.entries())
      .map(([meal, v]) => ({ meal, meanCalories: nDays ? Math.round(v.cal / nDays) : 0, items: v.items }))
      .sort((a, b) => b.meanCalories - a.meanCalories),
    topFoodsByCount: [...foods].sort((a, b) => b.count - a.count || b.calories - a.calories).slice(0, 5),
    topFoodsByCalories: [...foods].sort((a, b) => b.calories - a.calories).slice(0, 5),
    oilyEntries: {
      count: oily.length,
      days: new Set(oily.map((r) => r.date)).size,
      examples: Array.from(new Set(oily.map((r) => r.name.trim()))).slice(0, 5),
    },
    refs: rows.map((r) => r.ref),
  };
}

// ---------------------------------------------------------------------------
// Sleep & activity
// ---------------------------------------------------------------------------

export interface SleepStats {
  from: string;
  to: string;
  n: number;
  meanHours: number | null;
  medianHours: number | null;
  minHours: number | null;
  maxHours: number | null;
  sdHours: number | null;
  targetHours: number;
  /** mean - target (negative = short of target). */
  vsTargetHours: number | null;
  nShort: number;
  nLong: number;
  nMeetingTarget: number;
  shortDates: string[];
  refs: string[];
}

export function sleepStats(records: SleepRecord[], from: string, to: string, targetHours: number): SleepStats {
  const rows = inRange(records, from, to);
  const h = rows.map((r) => r.hours);
  const m = mean(h);
  return {
    from,
    to,
    n: rows.length,
    meanHours: r1(m),
    medianHours: r1(median(h)),
    minHours: h.length ? Math.min(...h) : null,
    maxHours: h.length ? Math.max(...h) : null,
    sdHours: r1(stdDev(h)),
    targetHours,
    vsTargetHours: m === null ? null : round(m - targetHours, 1),
    nShort: rows.filter((r) => r.hours < SLEEP_SHORT_HOURS).length,
    nLong: rows.filter((r) => r.hours > SLEEP_LONG_HOURS).length,
    nMeetingTarget: rows.filter((r) => r.hours >= targetHours).length,
    shortDates: rows.filter((r) => r.hours < SLEEP_SHORT_HOURS).map((r) => r.date),
    refs: rows.map((r) => r.ref),
  };
}

export interface ActivityStats {
  from: string;
  to: string;
  n: number;
  meanSteps: number | null;
  medianSteps: number | null;
  best: { steps: number; date: string; ref: string } | null;
  totalSteps: number;
  totalDistanceKm: number;
  meanWalkingMinutes: number | null;
  goal: number;
  nMetGoal: number;
  pctDaysMetGoal: number | null;
  /** mean steps as % of goal. */
  pctOfGoal: number | null;
  refs: string[];
}

export function activityStats(records: ActivityRecord[], from: string, to: string, goal: number): ActivityStats {
  const rows = inRange(records, from, to);
  const steps = rows.map((r) => r.steps);
  const ms = mean(steps);
  let best: ActivityStats["best"] = null;
  for (const r of rows) if (!best || r.steps > best.steps) best = { steps: r.steps, date: r.date, ref: r.ref };
  return {
    from,
    to,
    n: rows.length,
    meanSteps: r0(ms),
    medianSteps: r0(median(steps)),
    best,
    totalSteps: steps.reduce((a, b) => a + b, 0),
    totalDistanceKm: round(rows.reduce((a, r) => a + r.distance_km, 0), 1),
    meanWalkingMinutes: r0(mean(rows.map((r) => r.walking_minutes))),
    goal,
    nMetGoal: rows.filter((r) => r.steps >= goal).length,
    pctDaysMetGoal: pct(rows.filter((r) => r.steps >= goal).length, rows.length),
    pctOfGoal: ms !== null && goal > 0 ? Math.round((ms / goal) * 100) : null,
    refs: rows.map((r) => r.ref),
  };
}

// ---------------------------------------------------------------------------
// Medicine adherence
// ---------------------------------------------------------------------------

export interface AdherenceBucket {
  due: number;
  taken: number;
  late: number;
  missed: number;
  pending: number;
  pct: number | null;
}

export interface AdherenceStats extends AdherenceBucket {
  from: string;
  to: string;
  perMedicine: Array<AdherenceBucket & { medicineId: string; name: string; scheduled: string }>;
  perPart: Record<"morning" | "afternoon" | "evening" | "night", AdherenceBucket>;
  missedDates: string[];
  lateDates: string[];
  nAutoMissed: number;
  refs: string[];
}

/** Stable, human-readable id fragment for a medicine ("amlodipine_0730"); never a database id. */
export function medicineSlug(name: string, scheduled: string): string {
  const letters = name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 14) || "med";
  return `${letters}_${scheduled.replace(":", "")}`;
}

function partOfHHMM(hhmm: string): "morning" | "afternoon" | "evening" | "night" {
  const h = Number(hhmm.split(":")[0]);
  if (h >= 4 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

function bucket(doses: DoseRecord[]): AdherenceBucket {
  const c = (s: DoseRecord["status"]) => doses.filter((d) => d.status === s).length;
  const taken = c("taken");
  const late = c("late");
  const missed = c("missed");
  const pending = c("pending");
  return { due: taken + late + missed, taken, late, missed, pending, pct: adherencePct(doses) };
}

export function adherenceStats(doses: DoseRecord[], from: string, to: string, medicineId?: string | null): AdherenceStats {
  let rows = inRange(doses, from, to);
  if (medicineId) rows = rows.filter((d) => d.medicineId === medicineId);
  const per = new Map<string, DoseRecord[]>();
  for (const d of rows) per.set(d.medicineId, [...(per.get(d.medicineId) ?? []), d]);
  const parts: Record<string, DoseRecord[]> = { morning: [], afternoon: [], evening: [], night: [] };
  for (const d of rows) parts[partOfHHMM(d.scheduled)].push(d);
  return {
    from,
    to,
    ...bucket(rows),
    perMedicine: Array.from(per.entries()).map(([id, ds]) => ({
      medicineId: id,
      name: ds[0].medicineName,
      scheduled: ds[0].scheduled,
      ...bucket(ds),
    })),
    perPart: {
      morning: bucket(parts.morning),
      afternoon: bucket(parts.afternoon),
      evening: bucket(parts.evening),
      night: bucket(parts.night),
    },
    missedDates: Array.from(new Set(rows.filter((d) => d.status === "missed").map((d) => d.date))).sort(),
    lateDates: Array.from(new Set(rows.filter((d) => d.status === "late").map((d) => d.date))).sort(),
    nAutoMissed: rows.filter((d) => d.source === "auto_missed").length,
    refs: rows.map((d) => d.ref),
  };
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

export interface Completeness {
  lastDate: Partial<Record<Metric, string | null>>;
  daysSince: Partial<Record<Metric, number | null>>;
  streakDays: number;
  /** Distinct days with a BP reading in the last 30 days. */
  bpDays30: number;
  bpLongestGap30: number | null;
}

function lastOf(dates: string[]): string | null {
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
}

export function completeness(ctx: PatientContext): Completeness {
  const last: Completeness["lastDate"] = {
    bp: lastOf(ctx.bp.map((r) => r.date)),
    weight: lastOf(ctx.weight.map((r) => r.date)),
    food: lastOf(ctx.food.map((r) => r.date)),
    sleep: lastOf(ctx.sleep.map((r) => r.date)),
    steps: lastOf(ctx.activity.map((r) => r.date)),
    medicine: lastOf(ctx.doses.filter((d) => d.source === "logged").map((d) => d.date)),
  };
  const since: Completeness["daysSince"] = {};
  (Object.keys(last) as Metric[]).forEach((k) => {
    const d = last[k];
    since[k] = d ? daysBetweenIST(d, ctx.today) : null;
  });

  const anyDays = new Set<string>([
    ...ctx.bp.map((r) => r.date),
    ...ctx.weight.map((r) => r.date),
    ...ctx.food.map((r) => r.date),
    ...ctx.sleep.map((r) => r.date),
    ...ctx.activity.map((r) => r.date),
  ]);
  let streak = 0;
  let cursor = anyDays.has(ctx.today) ? ctx.today : addDaysIST(ctx.today, -1);
  while (anyDays.has(cursor)) {
    streak++;
    cursor = addDaysIST(cursor, -1);
  }

  const from30 = addDaysIST(ctx.today, -29);
  const bpDays = Array.from(new Set(ctx.bp.filter((r) => r.date >= from30).map((r) => r.date))).sort();
  let longest: number | null = null;
  if (bpDays.length > 0) {
    // Longest run of days WITHOUT a reading inside the 30-day window (leading and trailing runs included).
    longest = 0;
    let prev: string | null = null;
    for (const d of bpDays) {
      const gap = prev === null ? daysBetweenIST(from30, d) : daysBetweenIST(prev, d) - 1;
      longest = Math.max(longest, gap);
      prev = d;
    }
    longest = Math.max(longest, daysBetweenIST(prev as string, ctx.today));
  }
  return { lastDate: last, daysSince: since, streakDays: streak, bpDays30: bpDays.length, bpLongestGap30: longest };
}

// ---------------------------------------------------------------------------
// Associations (never causal)
// ---------------------------------------------------------------------------

export interface Association {
  id: string;
  label: string;
  labelHi: string;
  r: number;
  n: number;
  from: string;
  to: string;
}

export function associations(ctx: PatientContext, from: string, to: string): Association[] {
  const out: Association[] = [];
  const bpByDay = new Map<string, number[]>();
  for (const r of inRange(ctx.bp, from, to)) bpByDay.set(r.date, [...(bpByDay.get(r.date) ?? []), r.systolic]);
  const meanBp = (d: string) => mean(bpByDay.get(d) ?? []);

  const pair = (a: Array<[string, number]>, bOf: (d: string) => number | null) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [d, x] of a) {
      const y = bOf(d);
      if (y !== null) {
        xs.push(x);
        ys.push(y);
      }
    }
    return { xs, ys };
  };

  const sleepDays = inRange(ctx.sleep, from, to).map((s) => [s.date, s.hours] as [string, number]);
  const p1 = pair(sleepDays, meanBp);
  if (p1.xs.length >= MIN_ASSOCIATION_PAIRS) {
    const r = pearson(p1.xs, p1.ys);
    if (r !== null) out.push({ id: "bp_sleep", label: "Sleep hours vs same-day mean systolic BP", labelHi: "नींद के घंटे बनाम उसी दिन का औसत सिस्टोलिक BP", r: round(r, 2), n: p1.xs.length, from, to });
  }

  const sodiumDays = dailyNutrition(ctx.food, from, to)
    .filter((d) => d.itemsWithSodium > 0)
    .map((d) => [d.date, d.sodium_mg] as [string, number]);
  const p2 = pair(sodiumDays, meanBp);
  if (p2.xs.length >= MIN_ASSOCIATION_PAIRS) {
    const r = pearson(p2.xs, p2.ys);
    if (r !== null) out.push({ id: "bp_sodium", label: "Daily sodium vs same-day mean systolic BP", labelHi: "रोज़ का सोडियम बनाम उसी दिन का औसत सिस्टोलिक BP", r: round(r, 2), n: p2.xs.length, from, to });
  }

  const wByDay = new Map<string, number>();
  for (const w of inRange(ctx.weight, from, to)) wByDay.set(w.date, w.kg);
  const stepDays = inRange(ctx.activity, from, to).map((a) => [a.date, a.steps] as [string, number]);
  const p3 = pair(stepDays, (d) => wByDay.get(d) ?? null);
  if (p3.xs.length >= MIN_ASSOCIATION_PAIRS) {
    const r = pearson(p3.xs, p3.ys);
    if (r !== null) out.push({ id: "steps_weight", label: "Daily steps vs same-day weight", labelHi: "रोज़ के कदम बनाम उसी दिन का वज़न", r: round(r, 2), n: p3.xs.length, from, to });
  }
  return out;
}

// ---------------------------------------------------------------------------
// "Time ago"
// ---------------------------------------------------------------------------

export function agoLabel(minutes: number, lang: "hi" | "en"): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return lang === "hi" ? `${m} मिनट पहले` : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return lang === "hi" ? `${h} घंटे पहले` : `${h} h ago`;
  const d = Math.floor(h / 24);
  return lang === "hi" ? `${d} दिन पहले` : `${d} days ago`;
}

// ---------------------------------------------------------------------------
// Ledger assembly
// ---------------------------------------------------------------------------

function win(from: string, to: string, label: string): FactWindow {
  return { from, to, days: daysBetweenIST(from, to) + 1, label };
}

export function buildLedger(ctx: PatientContext, now: Date = new Date(ctx.generatedAt)): Ledger {
  const facts: Fact[] = [];
  const flags: LedgerFlag[] = [];
  const add = (f: Fact) => {
    facts.push(f);
  };
  const num = (
    id: string,
    label: string,
    labelHi: string,
    value: number | string | boolean | null,
    unit: string,
    window: FactWindow | null,
    n: number,
    extra: Partial<Fact> = {},
  ) => {
    if (value === null || value === undefined) return;
    add({ id, label, labelHi, value, unit, window, n, ...extra });
  };

  const th = ctx.goals.bp;
  const today = ctx.today;

  // --- profile & goals ---------------------------------------------------
  num("goal.bp_target_sys", "BP target systolic (below)", "BP लक्ष्य सिस्टोलिक (इससे कम)", th.target_systolic, "mmHg", null, 1, { kind: "stat" });
  num("goal.bp_target_dia", "BP target diastolic (below)", "BP लक्ष्य डायस्टोलिक (इससे कम)", th.target_diastolic, "mmHg", null, 1, { kind: "stat" });
  num("goal.bp_alert_sys", "BP alert systolic", "BP अलर्ट सिस्टोलिक", th.alert_systolic, "mmHg", null, 1, { kind: "stat" });
  num("goal.bp_alert_dia", "BP alert diastolic", "BP अलर्ट डायस्टोलिक", th.alert_diastolic, "mmHg", null, 1, { kind: "stat" });
  num("goal.bp_crisis_sys", "BP crisis systolic", "BP क्राइसिस सिस्टोलिक", th.crisis_systolic, "mmHg", null, 1, { kind: "stat" });
  num("goal.bp_crisis_dia", "BP crisis diastolic", "BP क्राइसिस डायस्टोलिक", th.crisis_diastolic, "mmHg", null, 1, { kind: "stat" });
  num("goal.calorie_target", "Daily calorie target", "रोज़ का कैलोरी लक्ष्य", ctx.goals.calorieTarget, "kcal", null, 1, { kind: "stat" });
  num("goal.step_goal", "Daily step goal", "रोज़ का कदम लक्ष्य", ctx.goals.stepGoal || DEFAULT_STEP_GOAL, "steps", null, 1, { kind: "stat" });
  num("goal.sleep_target", "Sleep target", "नींद का लक्ष्य", ctx.goals.sleepTargetHours, "hours", null, 1, { kind: "stat" });
  if (ctx.profile.targetWeightKg !== null) num("goal.target_weight", "Target weight", "लक्ष्य वज़न", ctx.profile.targetWeightKg, "kg", null, 1, { kind: "stat" });
  if (ctx.profile.age !== null) num("profile.age", "Age", "उम्र", ctx.profile.age, "years", null, 1, { kind: "stat" });
  if (ctx.profile.heightCm !== null) num("profile.height", "Height", "ऊँचाई", ctx.profile.heightCm, "cm", null, 1, { kind: "stat" });

  // --- data coverage -----------------------------------------------------
  const rangeWin = win(ctx.range.from, ctx.range.to, `loaded range (${ctx.range.days} days)`);
  num("data.range_days", "Days of history loaded", "लोड किए गए इतिहास के दिन", ctx.range.days, "days", rangeWin, ctx.range.days, { kind: "stat" });
  num("data.bp_count", "BP readings in loaded range", "लोड रेंज में BP रीडिंग", ctx.bp.length, "readings", rangeWin, ctx.bp.length, { kind: "stat" });
  num("data.weight_count", "Weight entries in loaded range", "लोड रेंज में वज़न एंट्री", ctx.weight.length, "entries", rangeWin, ctx.weight.length, { kind: "stat" });
  num("data.food_count", "Food items in loaded range", "लोड रेंज में खाने की एंट्री", ctx.food.length, "items", rangeWin, ctx.food.length, { kind: "stat" });
  num("data.sleep_count", "Sleep nights in loaded range", "लोड रेंज में नींद की एंट्री", ctx.sleep.length, "nights", rangeWin, ctx.sleep.length, { kind: "stat" });
  num("data.activity_count", "Step days in loaded range", "लोड रेंज में कदमों वाले दिन", ctx.activity.length, "days", rangeWin, ctx.activity.length, { kind: "stat" });
  num("data.dose_count", "Doses due in loaded range", "लोड रेंज में दवा की खुराकें", ctx.doses.filter((d) => d.status !== "pending").length, "doses", rangeWin, ctx.doses.length, { kind: "stat" });
  const truncatedMetrics = (Object.keys(ctx.truncated) as Metric[]).filter((m) => ctx.truncated[m]);
  if (truncatedMetrics.length) {
    add({
      id: "data.truncated",
      label: "Metrics whose history hit the load ceiling",
      labelHi: "जिन डेटा का इतिहास सीमा पर कट गया",
      value: truncatedMetrics.join(", "),
      unit: "",
      window: rangeWin,
      n: truncatedMetrics.length,
      kind: "flag",
    });
    flags.push({
      id: "truncated",
      severity: "attention",
      textEn: `History for ${truncatedMetrics.join(", ")} is cut at a hard row ceiling; older rows in the range are missing.`,
      textHi: `${truncatedMetrics.join(", ")} का इतिहास सीमा पर कट गया है, पुरानी एंट्री छूट सकती हैं।`,
      factIds: ["data.truncated"],
    });
  }

  const comp = completeness(ctx);
  (Object.keys(comp.daysSince) as Metric[]).forEach((m) => {
    const d = comp.daysSince[m];
    if (d !== null && d !== undefined) {
      num(`completeness.${m}.days_since_last`, `Days since last ${m} entry`, `आख़िरी ${m} एंट्री को बीते दिन`, d, "days", null, 1, { kind: "stat", note: `last entry ${comp.lastDate[m]}` });
    } else {
      num(`completeness.${m}.days_since_last`, `Days since last ${m} entry (none logged)`, `${m} की कोई एंट्री नहीं`, "none", "", null, 0, { kind: "stat" });
    }
  });
  num("completeness.streak_days", "Consecutive days with any log", "लगातार लॉग वाले दिन", comp.streakDays, "days", null, comp.streakDays, { kind: "stat" });
  num("completeness.bp_days_30d", "Days with a BP reading in last 30 days", "पिछले 30 दिन में BP वाले दिन", comp.bpDays30, "days", win(addDaysIST(today, -29), today, "last 30 days"), 30, { kind: "stat" });
  if (comp.bpLongestGap30 !== null) num("completeness.bp_longest_gap_30d", "Longest stretch without BP in last 30 days", "पिछले 30 दिन में BP के बिना सबसे लंबा अंतराल", comp.bpLongestGap30, "days", win(addDaysIST(today, -29), today, "last 30 days"), 30, { kind: "stat" });

  // --- latest readings ---------------------------------------------------
  const latestBP = ctx.bp[ctx.bp.length - 1];
  if (latestBP) {
    const cls = classifyBP(latestBP.systolic, latestBP.diastolic, th);
    const age = (now.getTime() - new Date(latestBP.at).getTime()) / 60000;
    const w = win(latestBP.date, latestBP.date, latestBP.date);
    add({ id: "bp.latest", label: "Latest BP", labelHi: "आख़िरी BP", value: `${latestBP.systolic}/${latestBP.diastolic}`, unit: "mmHg", window: w, n: 1, refs: [latestBP.ref], kind: "latest", note: `${latestBP.date} ${latestBP.time} IST; ${agoLabel(age, "en")}; ${cls.labelEn}` });
    num("bp.latest.systolic", "Latest systolic BP", "आख़िरी सिस्टोलिक BP", latestBP.systolic, "mmHg", w, 1, { refs: [latestBP.ref], kind: "latest" });
    num("bp.latest.diastolic", "Latest diastolic BP", "आख़िरी डायस्टोलिक BP", latestBP.diastolic, "mmHg", w, 1, { refs: [latestBP.ref], kind: "latest" });
    if (latestBP.pulse !== null) num("bp.latest.pulse", "Latest pulse", "आख़िरी नब्ज़", latestBP.pulse, "bpm", w, 1, { refs: [latestBP.ref], kind: "latest" });
    num("bp.latest.category", "Latest BP category", "आख़िरी BP श्रेणी", cls.labelEn, "", w, 1, { refs: [latestBP.ref], kind: "latest", note: cls.labelHi });
    num("bp.latest.minutes_ago", "Minutes since latest BP", "आख़िरी BP को बीते मिनट", Math.round(age), "minutes", w, 1, { refs: [latestBP.ref], kind: "latest" });
    if (cls.category === "crisis" && age <= 24 * 60) {
      flags.push({
        id: "bp_crisis_latest",
        severity: "urgent",
        textEn: `Latest BP ${latestBP.systolic}/${latestBP.diastolic} is in the crisis range (${agoLabel(age, "en")}).`,
        textHi: `आख़िरी BP ${latestBP.systolic}/${latestBP.diastolic} क्राइसिस रेंज में है (${agoLabel(age, "hi")})।`,
        factIds: ["bp.latest"],
      });
    }
  }
  const latestW = ctx.weight[ctx.weight.length - 1];
  if (latestW) {
    const w = win(latestW.date, latestW.date, latestW.date);
    num("weight.latest", "Latest weight", "आख़िरी वज़न", latestW.kg, "kg", w, 1, { refs: [latestW.ref], kind: "latest", note: `${latestW.date} ${latestW.time} IST` });
    const bmi = ctx.profile.heightCm ? calcBMI(latestW.kg, ctx.profile.heightCm) : null;
    if (bmi !== null) {
      const cls = classifyBMI(bmi);
      num("weight.bmi", "BMI at latest weight (WHO Asia-Pacific)", "आख़िरी वज़न पर BMI (WHO एशिया-प्रशांत)", bmi, "kg/m2", w, 1, { refs: [latestW.ref], kind: "stat", note: cls.labelEn });
      num("weight.bmi_category", "BMI category", "BMI श्रेणी", cls.labelEn, "", w, 1, { refs: [latestW.ref], kind: "stat", note: cls.labelHi });
    }
    if (ctx.profile.targetWeightKg !== null) {
      const toTarget = round(latestW.kg - ctx.profile.targetWeightKg, 1);
      num("weight.to_target", toTarget > 0 ? "Kg above target weight" : toTarget < 0 ? "Kg below target weight" : "At target weight", "लक्ष्य वज़न से अंतर", Math.abs(toTarget), "kg", w, 1, { refs: [latestW.ref], kind: "stat", note: toTarget > 0 ? "above target" : toTarget < 0 ? "below target" : "at target" });
      const first = ctx.weight[0];
      if (first && first.kg > ctx.profile.targetWeightKg && first.ref !== latestW.ref) {
        const prog = Math.round(((first.kg - latestW.kg) / (first.kg - ctx.profile.targetWeightKg)) * 100);
        num("weight.progress_pct", "Progress from first logged weight toward target", "पहले वज़न से लक्ष्य की ओर प्रगति", prog, "%", win(first.date, latestW.date, "loaded range"), ctx.weight.length, { refs: [first.ref, latestW.ref], kind: "stat" });
      }
    }
  }
  const latestSleep = ctx.sleep[ctx.sleep.length - 1];
  if (latestSleep) num("sleep.latest", "Latest sleep entry", "आख़िरी नींद एंट्री", latestSleep.hours, "hours", win(latestSleep.date, latestSleep.date, latestSleep.date), 1, { refs: [latestSleep.ref], kind: "latest" });
  const latestAct = ctx.activity[ctx.activity.length - 1];
  if (latestAct) num("steps.latest", "Latest steps entry", "आख़िरी कदम एंट्री", latestAct.steps, "steps", win(latestAct.date, latestAct.date, latestAct.date), 1, { refs: [latestAct.ref], kind: "latest" });

  // --- per-window statistics ---------------------------------------------
  for (const W of WINDOWS) {
    const from = addDaysIST(today, -(W.days - 1));
    const wd = win(from, today, W.en);
    const k = W.key;

    const bp = bpStats(ctx.bp, from, today, th);
    num(`bp.${k}.n`, "BP readings", "BP रीडिंग", bp.n, "readings", wd, bp.n, { kind: "stat" });
    if (bp.n > 0) {
      num(`bp.${k}.days`, "Days with BP readings", "BP वाले दिन", bp.daysWithReadings, "days", wd, bp.n, { kind: "stat" });
      num(`bp.${k}.mean_sys`, "Mean systolic BP", "औसत सिस्टोलिक BP", bp.meanSys, "mmHg", wd, bp.n, { refs: bp.refs.slice(-30), kind: "stat" });
      num(`bp.${k}.mean_dia`, "Mean diastolic BP", "औसत डायस्टोलिक BP", bp.meanDia, "mmHg", wd, bp.n, { kind: "stat" });
      num(`bp.${k}.median_sys`, "Median systolic BP", "मीडियन सिस्टोलिक BP", bp.medianSys, "mmHg", wd, bp.n, { kind: "stat" });
      num(`bp.${k}.median_dia`, "Median diastolic BP", "मीडियन डायस्टोलिक BP", bp.medianDia, "mmHg", wd, bp.n, { kind: "stat" });
      if (bp.highest) num(`bp.${k}.max`, "Highest reading", "सबसे ऊँची रीडिंग", `${bp.highest.systolic}/${bp.highest.diastolic}`, "mmHg", wd, bp.n, { refs: [bp.highest.ref], kind: "stat", note: bp.highest.date });
      if (bp.lowest) num(`bp.${k}.min`, "Lowest reading", "सबसे कम रीडिंग", `${bp.lowest.systolic}/${bp.lowest.diastolic}`, "mmHg", wd, bp.n, { refs: [bp.lowest.ref], kind: "stat", note: bp.lowest.date });
      num(`bp.${k}.sd_sys`, "Systolic variability (SD)", "सिस्टोलिक उतार-चढ़ाव (SD)", bp.sdSys, "mmHg", wd, bp.n, { kind: "stat" });
      num(`bp.${k}.sd_dia`, "Diastolic variability (SD)", "डायस्टोलिक उतार-चढ़ाव (SD)", bp.sdDia, "mmHg", wd, bp.n, { kind: "stat" });
      num(`bp.${k}.trend_sys_per_week`, "Systolic trend per week", "सिस्टोलिक का साप्ताहिक रुझान", bp.trendSysPerWeek, "mmHg/week", wd, bp.n, { kind: "stat" });
      num(`bp.${k}.trend_dia_per_week`, "Diastolic trend per week", "डायस्टोलिक का साप्ताहिक रुझान", bp.trendDiaPerWeek, "mmHg/week", wd, bp.n, { kind: "stat" });
      num(`bp.${k}.n_above_target`, "Readings at/above target", "लक्ष्य से ऊपर रीडिंग", bp.nAboveTarget, "readings", wd, bp.n, { kind: "stat" });
      num(`bp.${k}.pct_above_target`, "Readings at/above target", "लक्ष्य से ऊपर रीडिंग का %", bp.pctAboveTarget, "%", wd, bp.n, { kind: "stat" });
      num(`bp.${k}.n_alert`, "Readings in alert range or higher", "अलर्ट रेंज या उससे ऊपर रीडिंग", bp.nAlert, "readings", wd, bp.n, { kind: "stat" });
      num(`bp.${k}.pct_alert`, "Readings in alert range or higher", "अलर्ट रेंज या उससे ऊपर रीडिंग का %", bp.pctAlert, "%", wd, bp.n, { kind: "stat" });
      num(`bp.${k}.n_crisis`, "Readings in crisis range", "क्राइसिस रेंज में रीडिंग", bp.nCrisis, "readings", wd, bp.n, { kind: "stat" });
      if (bp.nLow > 0) num(`bp.${k}.n_low`, "Low BP readings", "कम BP रीडिंग", bp.nLow, "readings", wd, bp.n, { kind: "stat" });
      if (bp.morning.n > 0) {
        num(`bp.${k}.morning_mean_sys`, "Morning mean systolic", "सुबह का औसत सिस्टोलिक", bp.morning.meanSys, "mmHg", wd, bp.morning.n, { kind: "stat" });
        num(`bp.${k}.morning_mean_dia`, "Morning mean diastolic", "सुबह का औसत डायस्टोलिक", bp.morning.meanDia, "mmHg", wd, bp.morning.n, { kind: "stat" });
      }
      if (bp.evening.n > 0) {
        num(`bp.${k}.evening_mean_sys`, "Evening mean systolic", "शाम का औसत सिस्टोलिक", bp.evening.meanSys, "mmHg", wd, bp.evening.n, { kind: "stat" });
        num(`bp.${k}.evening_mean_dia`, "Evening mean diastolic", "शाम का औसत डायस्टोलिक", bp.evening.meanDia, "mmHg", wd, bp.evening.n, { kind: "stat" });
      }
      if (bp.pulse.n > 0) {
        num(`pulse.${k}.mean`, "Mean pulse", "औसत नब्ज़", bp.pulse.mean, "bpm", wd, bp.pulse.n, { kind: "stat" });
        num(`pulse.${k}.min`, "Lowest pulse", "सबसे कम नब्ज़", bp.pulse.min, "bpm", wd, bp.pulse.n, { kind: "stat" });
        num(`pulse.${k}.max`, "Highest pulse", "सबसे ज़्यादा नब्ज़", bp.pulse.max, "bpm", wd, bp.pulse.n, { kind: "stat" });
      }
    }

    const wt = weightStats(ctx.weight, from, today);
    num(`weight.${k}.n`, "Weight entries", "वज़न एंट्री", wt.n, "entries", wd, wt.n, { kind: "stat" });
    if (wt.n > 0) {
      num(`weight.${k}.mean`, "Mean weight", "औसत वज़न", wt.meanKg, "kg", wd, wt.n, { kind: "stat" });
      num(`weight.${k}.min`, "Lowest weight", "सबसे कम वज़न", wt.minKg, "kg", wd, wt.n, { kind: "stat" });
      num(`weight.${k}.max`, "Highest weight", "सबसे ज़्यादा वज़न", wt.maxKg, "kg", wd, wt.n, { kind: "stat" });
      if (wt.first) num(`weight.${k}.first`, "First weight in window", "विंडो का पहला वज़न", wt.first.kg, "kg", wd, wt.n, { refs: [wt.first.ref], kind: "stat", note: wt.first.date });
      if (wt.changeKg !== null) num(`weight.${k}.change`, "Change first to last entry", "पहली से आख़िरी एंट्री का बदलाव", wt.changeKg, "kg", wd, wt.n, { refs: wt.first && wt.last ? [wt.first.ref, wt.last.ref] : undefined, kind: "stat" });
      num(`weight.${k}.trend_per_week`, "Weight trend per week", "वज़न का साप्ताहिक रुझान", wt.trendPerWeek, "kg/week", wd, wt.n, { kind: "stat" });
    }

    const nu = nutritionStats(ctx.food, from, today, ctx.goals.calorieTarget);
    num(`food.${k}.days_logged`, "Days with food logged", "खाना दर्ज वाले दिन", nu.daysLogged, "days", wd, nu.items, { kind: "stat" });
    if (nu.daysLogged > 0) {
      num(`food.${k}.items`, "Food items logged", "दर्ज खाने की एंट्री", nu.items, "items", wd, nu.items, { kind: "stat" });
      num(`food.${k}.mean_calories`, "Mean calories per logged day", "दर्ज दिनों का औसत कैलोरी", nu.meanCalories, "kcal/day", wd, nu.daysLogged, { kind: "stat" });
      num(`food.${k}.pct_of_calorie_target`, "Mean calories as % of target", "औसत कैलोरी लक्ष्य का %", nu.pctOfTarget, "%", wd, nu.daysLogged, { kind: "stat" });
      num(`food.${k}.days_above_target`, "Days above calorie target", "कैलोरी लक्ष्य से ऊपर वाले दिन", nu.daysAboveTarget, "days", wd, nu.daysLogged, { kind: "stat" });
      num(`food.${k}.mean_protein`, "Mean protein per logged day", "औसत प्रोटीन प्रति दिन", nu.meanProtein, "g/day", wd, nu.daysLogged, { kind: "stat" });
      num(`food.${k}.mean_carbs`, "Mean carbohydrate per logged day", "औसत कार्ब्स प्रति दिन", nu.meanCarbs, "g/day", wd, nu.daysLogged, { kind: "stat" });
      num(`food.${k}.mean_fat`, "Mean fat per logged day", "औसत फैट प्रति दिन", nu.meanFat, "g/day", wd, nu.daysLogged, { kind: "stat" });
      num(`food.${k}.mean_fibre`, "Mean fibre per logged day", "औसत फाइबर प्रति दिन", nu.meanFibre, "g/day", wd, nu.daysLogged, { kind: "stat" });
      if (nu.meanSodium !== null) {
        num(`food.${k}.mean_sodium`, "Mean sodium per logged day (items with sodium data only)", "औसत सोडियम प्रति दिन (केवल जिनमें सोडियम डेटा है)", nu.meanSodium, "mg/day", wd, nu.daysLogged, { kind: "stat", note: `sodium data on ${nu.sodiumCoveragePct}% of items` });
        num(`food.${k}.sodium_coverage_pct`, "Share of food items with sodium data", "सोडियम डेटा वाली एंट्री का %", nu.sodiumCoveragePct, "%", wd, nu.items, { kind: "stat" });
      }
      num(`food.${k}.oily_entries`, "Entries with oil/ghee/fried foods (by name)", "तेल/घी/तले खाने वाली एंट्री (नाम से)", nu.oilyEntries.count, "items", wd, nu.items, { kind: "stat", note: "counted by food name; not a measurement of oil used" });
    }

    const sl = sleepStats(ctx.sleep, from, today, ctx.goals.sleepTargetHours);
    num(`sleep.${k}.n`, "Sleep entries", "नींद एंट्री", sl.n, "nights", wd, sl.n, { kind: "stat" });
    if (sl.n > 0) {
      num(`sleep.${k}.mean`, "Mean sleep", "औसत नींद", sl.meanHours, "hours", wd, sl.n, { kind: "stat" });
      num(`sleep.${k}.min`, "Shortest sleep", "सबसे कम नींद", sl.minHours, "hours", wd, sl.n, { kind: "stat" });
      num(`sleep.${k}.max`, "Longest sleep", "सबसे ज़्यादा नींद", sl.maxHours, "hours", wd, sl.n, { kind: "stat" });
      num(`sleep.${k}.vs_target`, "Mean sleep minus target", "औसत नींद - लक्ष्य", sl.vsTargetHours, "hours", wd, sl.n, { kind: "stat" });
      num(`sleep.${k}.n_short`, `Nights under ${SLEEP_SHORT_HOURS} hours`, `${SLEEP_SHORT_HOURS} घंटे से कम वाली रातें`, sl.nShort, "nights", wd, sl.n, { kind: "stat" });
      num(`sleep.${k}.n_meeting_target`, "Nights meeting the sleep target", "लक्ष्य पूरा करने वाली रातें", sl.nMeetingTarget, "nights", wd, sl.n, { kind: "stat" });
    }

    const ac = activityStats(ctx.activity, from, today, ctx.goals.stepGoal || DEFAULT_STEP_GOAL);
    num(`steps.${k}.n`, "Days with steps logged", "कदम दर्ज वाले दिन", ac.n, "days", wd, ac.n, { kind: "stat" });
    if (ac.n > 0) {
      num(`steps.${k}.mean`, "Mean steps per logged day", "औसत कदम प्रति दिन", ac.meanSteps, "steps", wd, ac.n, { kind: "stat" });
      num(`steps.${k}.median`, "Median steps per logged day", "मीडियन कदम प्रति दिन", ac.medianSteps, "steps", wd, ac.n, { kind: "stat" });
      if (ac.best) num(`steps.${k}.best`, "Most steps in a day", "एक दिन में सबसे ज़्यादा कदम", ac.best.steps, "steps", wd, ac.n, { refs: [ac.best.ref], kind: "stat", note: ac.best.date });
      num(`steps.${k}.total`, "Total steps", "कुल कदम", ac.totalSteps, "steps", wd, ac.n, { kind: "stat" });
      num(`steps.${k}.days_met_goal`, "Days meeting the step goal", "कदम लक्ष्य पूरा करने वाले दिन", ac.nMetGoal, "days", wd, ac.n, { kind: "stat" });
      num(`steps.${k}.pct_of_goal`, "Mean steps as % of goal", "औसत कदम लक्ष्य का %", ac.pctOfGoal, "%", wd, ac.n, { kind: "stat" });
      num(`steps.${k}.mean_walking_minutes`, "Mean walking minutes", "औसत चलने के मिनट", ac.meanWalkingMinutes, "minutes", wd, ac.n, { kind: "stat" });
    }

    const ad = adherenceStats(ctx.doses, from, today);
    num(`meds.${k}.due`, "Doses due (excluding still-pending)", "देय खुराकें (पेंडिंग छोड़कर)", ad.due, "doses", wd, ad.due, { kind: "stat" });
    if (ad.due > 0) {
      num(`meds.${k}.taken`, "Doses taken on time", "समय पर ली गई खुराकें", ad.taken, "doses", wd, ad.due, { kind: "stat" });
      num(`meds.${k}.late`, `Doses taken late (over ${MEDICINE_LATE_AFTER_MIN} min after schedule)`, "देर से ली गई खुराकें", ad.late, "doses", wd, ad.due, { kind: "stat" });
      num(`meds.${k}.missed`, "Doses missed", "छूटी हुई खुराकें", ad.missed, "doses", wd, ad.due, { kind: "stat" });
      num(`meds.${k}.adherence_pct`, "Adherence (taken + late of due)", "दवा पालन (ली गई / देय)", ad.pct, "%", wd, ad.due, { kind: "stat" });
      for (const m of ad.perMedicine) {
        if (m.due > 0) num(`meds.${k}.by_medicine.${medicineSlug(m.name, m.scheduled)}`, `Adherence: ${m.name} (${m.scheduled})`, `पालन: ${m.name} (${m.scheduled})`, m.pct, "%", wd, m.due, { kind: "stat" });
      }
    }
  }

  // --- derived flags ------------------------------------------------------
  const bp7 = bpStats(ctx.bp, addDaysIST(today, -6), today, th);
  if (bp7.n >= 3 && (bp7.pctAboveTarget ?? 0) >= 50) {
    flags.push({
      id: "bp_above_target_7d",
      severity: (bp7.pctAlert ?? 0) >= 30 ? "urgent" : "attention",
      textEn: `${bp7.pctAboveTarget}% of the ${bp7.n} BP readings in the last 7 days were at or above target (${th.target_systolic}/${th.target_diastolic}).`,
      textHi: `पिछले 7 दिन की ${bp7.n} BP रीडिंग में से ${bp7.pctAboveTarget}% लक्ष्य (${th.target_systolic}/${th.target_diastolic}) या उससे ऊपर थीं।`,
      factIds: ["bp.7d.pct_above_target", "bp.7d.n"],
    });
  }
  if (bp7.nAlert > 0) {
    flags.push({
      id: "bp_alert_7d",
      severity: "attention",
      textEn: `${bp7.nAlert} of ${bp7.n} readings in the last 7 days were in the alert range (${th.alert_systolic}/${th.alert_diastolic} or higher).`,
      textHi: `पिछले 7 दिन में ${bp7.n} में से ${bp7.nAlert} रीडिंग अलर्ट रेंज (${th.alert_systolic}/${th.alert_diastolic} या ऊपर) में थीं।`,
      factIds: ["bp.7d.n_alert", "bp.7d.n"],
    });
  }
  const sinceBP = comp.daysSince.bp;
  if (sinceBP !== null && sinceBP !== undefined && sinceBP >= 3) {
    flags.push({
      id: "bp_gap",
      severity: "attention",
      textEn: `No BP has been logged for ${sinceBP} days.`,
      textHi: `${sinceBP} दिन से कोई BP दर्ज नहीं हुआ।`,
      factIds: ["completeness.bp.days_since_last"],
    });
  }
  const w7 = weightStats(ctx.weight, addDaysIST(today, -6), today);
  if (w7.changeKg !== null && Math.abs(w7.changeKg) >= WEIGHT_RAPID_KG_7D) {
    flags.push({
      id: "weight_rapid_7d",
      severity: "attention",
      textEn: `Weight changed ${w7.changeKg > 0 ? "+" : ""}${w7.changeKg} kg within 7 days (flag threshold ${WEIGHT_RAPID_KG_7D} kg).`,
      textHi: `7 दिन में वज़न ${w7.changeKg > 0 ? "+" : ""}${w7.changeKg} किग्रा बदला (फ़्लैग सीमा ${WEIGHT_RAPID_KG_7D} किग्रा)।`,
      factIds: ["weight.7d.change"],
    });
  }
  const w30 = weightStats(ctx.weight, addDaysIST(today, -29), today);
  if (w30.first && w30.changeKg !== null && w30.first.kg > 0) {
    const p = (Math.abs(w30.changeKg) / w30.first.kg) * 100;
    if (p >= WEIGHT_RAPID_PCT_30D) {
      flags.push({
        id: "weight_rapid_30d",
        severity: "attention",
        textEn: `Weight changed ${w30.changeKg > 0 ? "+" : ""}${w30.changeKg} kg (${round(p, 1)}%) within 30 days (flag threshold ${WEIGHT_RAPID_PCT_30D}%).`,
        textHi: `30 दिन में वज़न ${w30.changeKg > 0 ? "+" : ""}${w30.changeKg} किग्रा (${round(p, 1)}%) बदला (फ़्लैग सीमा ${WEIGHT_RAPID_PCT_30D}%)।`,
        factIds: ["weight.30d.change"],
      });
    }
  }

  const sl7 = sleepStats(ctx.sleep, addDaysIST(today, -6), today, ctx.goals.sleepTargetHours);
  if (sl7.n >= 3 && (sl7.nShort >= 3 || (sl7.meanHours ?? 99) < SLEEP_SHORT_HOURS)) {
    flags.push({
      id: "sleep_short_7d",
      severity: "info",
      textEn: `${sl7.nShort} of ${sl7.n} nights in the last 7 days were under ${SLEEP_SHORT_HOURS} hours (mean ${sl7.meanHours} h).`,
      textHi: `पिछले 7 दिन में ${sl7.n} में से ${sl7.nShort} रातें ${SLEEP_SHORT_HOURS} घंटे से कम की थीं (औसत ${sl7.meanHours} घंटे)।`,
      factIds: ["sleep.7d.n_short", "sleep.7d.mean"],
    });
  }
  const ac7 = activityStats(ctx.activity, addDaysIST(today, -6), today, ctx.goals.stepGoal || DEFAULT_STEP_GOAL);
  if (ac7.n >= 3 && (ac7.pctOfGoal ?? 100) < 50) {
    flags.push({
      id: "steps_low_7d",
      severity: "info",
      textEn: `Mean steps in the last 7 days are ${ac7.pctOfGoal}% of the goal (${ac7.meanSteps} vs ${ac7.goal}).`,
      textHi: `पिछले 7 दिन के औसत कदम लक्ष्य का ${ac7.pctOfGoal}% हैं (${ac7.meanSteps} बनाम ${ac7.goal})।`,
      factIds: ["steps.7d.pct_of_goal", "steps.7d.mean"],
    });
  }
  const ad7 = adherenceStats(ctx.doses, addDaysIST(today, -6), today);
  if (ad7.due >= 4 && (ad7.pct ?? 100) < 80) {
    flags.push({
      id: "meds_low_7d",
      severity: "attention",
      textEn: `Medicine adherence over the last 7 days is ${ad7.pct}% (${ad7.missed} missed of ${ad7.due} due).`,
      textHi: `पिछले 7 दिन में दवा पालन ${ad7.pct}% है (${ad7.due} में से ${ad7.missed} छूटी)।`,
      factIds: ["meds.7d.adherence_pct", "meds.7d.missed"],
    });
  }
  const nu30 = nutritionStats(ctx.food, addDaysIST(today, -29), today, ctx.goals.calorieTarget);
  if (nu30.meanSodium !== null && (nu30.sodiumCoveragePct ?? 0) >= 50 && nu30.meanSodium > SODIUM_LIMIT_MG_PER_DAY) {
    flags.push({
      id: "sodium_high_30d",
      severity: "attention",
      textEn: `Mean logged sodium is ${nu30.meanSodium} mg/day over 30 days, above the ${SODIUM_LIMIT_MG_PER_DAY} mg/day general limit (ideal for high BP: ${SODIUM_IDEAL_MG_PER_DAY} mg).`,
      textHi: `30 दिन में दर्ज औसत सोडियम ${nu30.meanSodium} mg/दिन है, जो सामान्य सीमा ${SODIUM_LIMIT_MG_PER_DAY} mg/दिन से ज़्यादा है (हाई BP में आदर्श: ${SODIUM_IDEAL_MG_PER_DAY} mg)।`,
      factIds: ["food.30d.mean_sodium"],
    });
  }
  if (nu30.daysLogged >= 5 && (nu30.pctOfTarget ?? 0) > 110) {
    flags.push({
      id: "calories_high_30d",
      severity: "info",
      textEn: `Mean logged calories are ${nu30.pctOfTarget}% of the ${ctx.goals.calorieTarget} kcal target over 30 days.`,
      textHi: `30 दिन में दर्ज औसत कैलोरी ${ctx.goals.calorieTarget} kcal लक्ष्य का ${nu30.pctOfTarget}% है।`,
      factIds: ["food.30d.pct_of_calorie_target"],
    });
  }
  const todayDoses = adherenceStats(ctx.doses, today, today);
  if (todayDoses.missed > 0) {
    flags.push({
      id: "meds_missed_today",
      severity: "attention",
      textEn: `${todayDoses.missed} dose(s) already counted as missed today.`,
      textHi: `आज ${todayDoses.missed} खुराक छूटी मानी गई है।`,
      factIds: ["meds.today.missed"],
    });
  }
  const totalRecords = ctx.bp.length + ctx.weight.length + ctx.food.length + ctx.sleep.length + ctx.activity.length;
  if (totalRecords === 0) {
    flags.push({
      id: "no_data",
      severity: "info",
      textEn: "No health logs exist for this patient in the loaded range.",
      textHi: "लोड रेंज में इस मरीज़ का कोई स्वास्थ्य लॉग नहीं है।",
      factIds: ["data.range_days"],
    });
  }

  // --- associations ------------------------------------------------------
  const assocFrom = addDaysIST(today, -89);
  for (const a of associations(ctx, assocFrom, today)) {
    add({
      id: `assoc.${a.id}.r`,
      label: `${a.label} (correlation r)`,
      labelHi: `${a.labelHi} (सहसंबंध r)`,
      value: a.r,
      unit: "r",
      window: win(a.from, a.to, "last 90 days"),
      n: a.n,
      kind: "association",
      note: "association, not cause",
    });
  }

  const byId: Record<string, Fact> = {};
  for (const f of facts) byId[f.id] = f;
  return { facts, byId, flags };
}

// ---------------------------------------------------------------------------
// Rendering for the model / for evidence chips
// ---------------------------------------------------------------------------

export function valueText(f: Fact): string {
  return `${f.value}${f.unit ? ` ${f.unit}` : ""}`;
}

/** One compact line per fact: "bp.7d.mean_sys = 134.2 mmHg | Mean systolic BP | last 7 days 2026-09-28..2026-10-04 | n=12". */
export function factLine(f: Fact): string {
  const w = f.window ? ` | ${f.window.label} ${f.window.from}..${f.window.to}` : "";
  const note = f.note ? ` | ${f.note}` : "";
  const refs = f.refs && f.refs.length ? ` | refs: ${f.refs.slice(0, 4).join(",")}` : "";
  return `${f.id} = ${valueText(f)} | ${f.label}${w} | n=${f.n}${note}${refs}`;
}

/** Window keys (`7d`, `30d`, ...) a fact id carries, or null for window-less facts. */
function factWindowKey(id: string): string | null {
  const m = /^[a-z]+\.(today|7d|14d|30d|90d)\./.exec(id);
  return m ? m[1] : null;
}

export function renderLedger(ledger: Ledger, opts: { windows?: string[] } = {}): string {
  const allow = opts.windows ? new Set(opts.windows) : null;
  const lines = ledger.facts
    .filter((f) => {
      if (!allow) return true;
      const k = factWindowKey(f.id);
      return k === null || allow.has(k);
    })
    .map(factLine);
  return `FACTS (computed by code; cite by id)\n${lines.join("\n")}\n\n${renderFlags(ledger)}`;
}

export function renderFlags(ledger: Ledger): string {
  const flags = ledger.flags.map((fl) => `[${fl.severity}] ${fl.textEn} (facts: ${fl.factIds.join(", ")})`);
  return `FLAGS (computed by code)\n${flags.length ? flags.join("\n") : "none"}`;
}

/** Number of underlying data points, for telemetry (no PHI). */
export function dataPointCount(ctx: PatientContext): number {
  return ctx.bp.length + ctx.weight.length + ctx.food.length + ctx.sleep.length + ctx.activity.length + ctx.doses.length;
}

