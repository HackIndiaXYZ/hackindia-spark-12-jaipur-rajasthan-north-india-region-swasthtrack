/**
 * Daily wellness score: pure calculation (no I/O) so it can be tested with fixtures.
 *
 * The score blends two separate things:
 *   - COMPLETENESS: did we log what was due so far today? Items that are not yet
 *     due (evening BP at 7 AM, dinner at noon, steps before 8 PM) are excluded, so
 *     a morning is not penalised for the afternoon.
 *   - HEALTH STATUS: how did the logged values look against this patient's own
 *     goals and thresholds (BP vs the patient's BP lines, adherence of due doses,
 *     sleep vs target, steps vs goal, day-total calories vs target)?
 *
 *   component % = 35% completeness + 65% health status (health missing -> completeness)
 *   total       = weight-averaged component % over the components that are scored
 *
 * A crisis-range BP caps the total (and raises an alert) so a "complete" day can
 * never look healthy while a dangerous reading sits in the log.
 */
import {
  CALORIE_RATIO,
  DUE_AT_MIN,
  SLEEP_LONG_HOURS,
  SLEEP_SHORT_HOURS,
  WEIGHT_FRESH_DAYS,
  WEIGHT_RAPID_KG_7D,
  WELLNESS_ALERT_BP_CAP,
  WELLNESS_COMPLETENESS_WEIGHT,
  WELLNESS_CRISIS_CAP,
  WELLNESS_HEALTH_WEIGHT,
  classifyBP,
  classifyPulse,
  evaluateBPSchedule,
  isPlausibleBP,
  round,
  type BPClassification,
  type BPSchedule,
  type BPThresholds,
} from "../health-rules";
import { summarizeAdherence, type DoseRecord } from "./adherence";
import { ageInDays } from "./dates";

export interface ScoreWeights {
  medicine: number;
  food: number;
  activity: number;
  sleep: number;
  bp: number;
  weight: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  medicine: 25,
  food: 20,
  activity: 15,
  sleep: 15,
  bp: 15,
  weight: 10,
};

export type ConsistencyCategory =
  | "Excellent consistency"
  | "Good consistency"
  | "Needs improvement"
  | "Low consistency"
  | "Not enough data yet";

export type ComponentStatus = "completed" | "partial" | "missing" | "not_due";
export type ComponentConcern = "none" | "watch" | "alert";
export type ComponentKey = keyof ScoreWeights;

export interface ComponentScoreBreakdown {
  /** Points earned out of `maxScore` (percent x maxScore). 0 and unscored when `status` is "not_due". */
  score: number;
  maxScore: number;
  percent: number;
  /** "not_due": nothing was due yet and nothing logged, so it is left out of the total. */
  status: ComponentStatus;
  details: string;
  detailsHi: string;
  /** 0-100 over what was due so far; null when nothing was due. */
  completenessPct: number | null;
  /** 0-100 for the logged values vs goals/thresholds; null when it cannot be judged. */
  healthPct: number | null;
  /** Whether this component is part of the total. */
  isScored: boolean;
  concern: ComponentConcern;
  /** Items due so far (doses, main meals, BP readings, ...) and how many of them were logged. */
  expectedItems: number;
  loggedItems: number;
}

export interface WellnessBreakdownItem {
  key: ComponentKey;
  labelHi: string;
  labelEn: string;
  /** Nominal weight (points out of 100). */
  weight: number;
  isScored: boolean;
  completenessPct: number | null;
  healthPct: number | null;
  percent: number;
  /** Points this component adds to the total (after re-weighting the scored components). */
  contributionPts: number;
  noteHi: string;
  noteEn: string;
}

export interface WellnessAlert {
  severity: "URGENT" | "IMPORTANT" | "ATTENTION";
  messageHi: string;
  messageEn: string;
}

export interface DailyWellnessScoreResult {
  date: string;
  patientId: string;
  totalScore: number;
  maxScore: number;
  category: ConsistencyCategory;
  categoryHi: string;
  components: Record<ComponentKey, ComponentScoreBreakdown>;
  reasons: {
    /** Hindi. */
    positive: string[];
    deductions: string[];
  };
  reasonsEn: {
    positive: string[];
    deductions: string[];
  };
  missingDataItems: string[];
  nutritionContext?: {
    caloriesConsumed: number;
    calorieTarget: number;
    calorieDiff: number;
    calorieStatusMessage: string;
  };
  calculationVersion: string;
  calculatedAt: string;

  // ---- added in v2 ----
  /** False when nothing was logged (or nothing could be judged): show "no data", not the number. */
  isSufficient: boolean;
  insufficientReasonHi?: string;
  insufficientReasonEn?: string;
  /** 0-100: share of the items due so far that were logged (weighted). */
  dataCompleteness: number;
  /** Items due so far across scored components, and how many were logged. */
  itemsExpected: number;
  itemsLogged: number;
  /** 0-100: how the logged values looked against goals and thresholds; null when nothing could be judged. */
  healthStatusScore: number | null;
  /** Share (0-100) of the nominal weights that are scored right now. */
  scoredWeightPct: number;
  /** Set when a dangerous reading limited the total. */
  scoreCap: { cap: number; reasonHi: string; reasonEn: string } | null;
  breakdown: WellnessBreakdownItem[];
  alerts: WellnessAlert[];
  isToday: boolean;
}

export interface WellnessBPReading {
  systolic: number;
  diastolic: number;
  pulse: number | null;
  readingType: string | null;
  /** IST minutes since midnight. */
  minutesOfDay: number;
}

export interface WellnessInput {
  date: string;
  patientId: string;
  /** IST minute of day when `date` is today; null for a finished day (everything is due). */
  nowMinutes: number | null;
  /** Doses of this date that were due by now (see buildDoseRecords). */
  doses: DoseRecord[];
  /** Whether the patient has any active medicine at all. */
  hasActiveMedicines: boolean;
  foodLogs: Array<{ meal_type: string; calories: number | null }>;
  steps: number | null;
  sleepHours: number | null;
  bpReadings: WellnessBPReading[];
  /** Weight readings from (date - 7) through date; newest last. */
  recentWeights: Array<{ date: string; kg: number }>;
  goals: { calorieTarget: number; stepGoal: number; sleepTarget: number };
  bpSchedule: BPSchedule;
  bpThresholds: BPThresholds;
  weights?: ScoreWeights;
  calculatedAt?: string;
}

/** Label/colour bucket for a 0-100 score. */
export function getScoreCategory(score: number): {
  category: ConsistencyCategory;
  categoryHi: string;
  badgeTone: "green" | "blue" | "amber" | "red";
} {
  if (score >= 90) return { category: "Excellent consistency", categoryHi: "उत्कृष्ट निरंतरता", badgeTone: "green" };
  if (score >= 75) return { category: "Good consistency", categoryHi: "अच्छी निरंतरता", badgeTone: "blue" };
  if (score >= 60) return { category: "Needs improvement", categoryHi: "सुधार की आवश्यकता", badgeTone: "amber" };
  return { category: "Low consistency", categoryHi: "कम निरंतरता", badgeTone: "red" };
}

// ---------------------------------------------------------------------------

interface CompCalc {
  applicable: boolean;
  completeness: number | null;
  health: number | null;
  status: ComponentStatus;
  concern: ComponentConcern;
  details: string;
  detailsHi: string;
  noteEn: string;
  noteHi: string;
  positiveHi: string[];
  positiveEn: string[];
  deductionHi: string[];
  deductionEn: string[];
  missingHi: string[];
  expected: number;
  logged: number;
}

function emptyComp(): CompCalc {
  return {
    expected: 0,
    logged: 0,
    applicable: false,
    completeness: null,
    health: null,
    status: "not_due",
    concern: "none",
    details: "",
    detailsHi: "",
    noteEn: "",
    noteHi: "",
    positiveHi: [],
    positiveEn: [],
    deductionHi: [],
    deductionEn: [],
    missingHi: [],
  };
}

/** Quality (0-100) of one BP reading against the patient's own lines. */
export function bpQuality(c: BPClassification): number {
  if (c.category === "crisis") return 0;
  if (c.exceedsAlert) return 25;
  if (c.category === "low") return c.needsUrgentAttention ? 25 : 55;
  if (c.category === "stage2") return 45;
  if (c.aboveTarget) return 70;
  if (c.category === "stage1" || c.category === "elevated") return 90;
  return 100;
}

function mealSlot(mealType: string): "breakfast" | "lunch" | "dinner" | "other" {
  const t = mealType.toLowerCase().trim();
  if (t === "breakfast" || t === "mid-morning") return "breakfast";
  if (t === "lunch") return "lunch";
  if (t === "dinner") return "dinner";
  return "other";
}

const MEAL_LABEL_HI = { breakfast: "नाश्ता", lunch: "दोपहर का भोजन", dinner: "रात का भोजन" } as const;
const MEAL_LABEL_EN = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" } as const;

function pct(n: number | null): string {
  return n === null ? "-" : `${Math.round(n)}%`;
}

// --- medicine ---------------------------------------------------------------

function calcMedicine(input: WellnessInput): CompCalc {
  const c = emptyComp();
  const doses = input.doses;
  if (doses.length === 0) {
    c.details = input.hasActiveMedicines ? "No dose due yet" : "No active medicines scheduled";
    c.detailsHi = input.hasActiveMedicines ? "अभी किसी दवाई का समय नहीं हुआ" : "कोई दवाई निर्धारित नहीं है";
    c.noteEn = c.details;
    c.noteHi = c.detailsHi;
    return c;
  }
  const s = summarizeAdherence(doses);
  const logged = doses.filter((d) => d.hasRealLog && d.status !== "pending").length;
  c.applicable = true;
  c.completeness = (logged / doses.length) * 100;
  c.health = s.pct;
  c.expected = doses.length;
  c.logged = logged;

  if (s.adherent === doses.length) {
    c.status = "completed";
    c.details = `All ${doses.length} due doses taken`;
    c.detailsHi = `समय आ चुकी सभी ${doses.length} दवाइयाँ ली गईं`;
    c.positiveEn.push(`All ${doses.length} doses due so far were taken.`);
    c.positiveHi.push(`अब तक की सभी ${doses.length} निर्धारित दवाइयाँ ली गईं।`);
  } else if (s.adherent > 0) {
    c.status = "partial";
    c.details = `${s.adherent} of ${doses.length} due doses taken`;
    c.detailsHi = `समय आ चुकी ${doses.length} में से ${s.adherent} दवाइयाँ ली गईं`;
  } else {
    c.status = "missing";
    c.details = `0 of ${doses.length} due doses taken`;
    c.detailsHi = `समय आ चुकी ${doses.length} दवाइयों में से कोई दर्ज नहीं`;
  }
  if (s.missed > 0) {
    c.concern = s.missed >= 2 ? "alert" : "watch";
    c.deductionEn.push(`${s.missed} dose(s) missed.`);
    c.deductionHi.push(`${s.missed} दवाई छूट गई।`);
  }
  if (s.pending > 0) {
    c.deductionEn.push(`${s.pending} dose(s) due but not yet confirmed.`);
    c.deductionHi.push(`${s.pending} दवाई का समय हो चुका है, अभी दर्ज नहीं हुई।`);
    c.missingHi.push(`${s.pending} दवाई का रिकॉर्ड`);
  }
  if (s.late > 0) {
    c.deductionEn.push(`${s.late} dose(s) taken late.`);
    c.deductionHi.push(`${s.late} दवाई देर से ली गई।`);
  }
  c.noteEn = `Logged ${pct(c.completeness)} of due doses; adherence ${pct(c.health)} (taken + late / taken + late + missed).`;
  c.noteHi = `समय आ चुकी दवाइयों में से ${pct(c.completeness)} दर्ज; नियमितता ${pct(c.health)} (ली गई + देर से / कुल)।`;
  return c;
}

// --- food -------------------------------------------------------------------

function calcFood(input: WellnessInput): { comp: CompCalc; nutrition?: DailyWellnessScoreResult["nutritionContext"] } {
  const c = emptyComp();
  const { nowMinutes, foodLogs, goals } = input;
  const due = (m: number) => nowMinutes === null || nowMinutes >= m;

  const slotLogged = { breakfast: false, lunch: false, dinner: false };
  for (const f of foodLogs) {
    const slot = mealSlot(f.meal_type);
    if (slot !== "other") slotLogged[slot] = true;
  }
  const slotDue = {
    breakfast: due(DUE_AT_MIN.breakfast),
    lunch: due(DUE_AT_MIN.lunch),
    dinner: due(DUE_AT_MIN.dinner),
  };
  const counted = (["breakfast", "lunch", "dinner"] as const).filter((k) => slotDue[k] || slotLogged[k]);
  const loggedCount = counted.filter((k) => slotLogged[k]).length;
  const anyFood = foodLogs.length > 0;

  const totalCal = foodLogs.reduce((s, f) => s + Number(f.calories || 0), 0);
  const diff = Math.round(totalCal - goals.calorieTarget);
  const dayComplete = nowMinutes === null || slotLogged.dinner || nowMinutes >= DUE_AT_MIN.dinner;
  const mainLogged = (["breakfast", "lunch", "dinner"] as const).filter((k) => slotLogged[k]).length;

  let nutrition: DailyWellnessScoreResult["nutritionContext"];
  if (anyFood) {
    const msgHi = !dayComplete
      ? `अब तक ${Math.round(totalCal)} kcal दर्ज (दिन का लक्ष्य ${goals.calorieTarget} kcal)।`
      : diff > 0
        ? `आज का कैलोरी सेवन लक्ष्य से ${diff} kcal ऊपर रहा।`
        : diff < 0
          ? `आज का कैलोरी सेवन लक्ष्य से ${Math.abs(diff)} kcal कम रहा।`
          : "आज का कैलोरी सेवन लक्ष्य के बराबर रहा।";
    nutrition = {
      caloriesConsumed: Math.round(totalCal),
      calorieTarget: goals.calorieTarget,
      calorieDiff: diff,
      calorieStatusMessage: msgHi,
    };
  }

  if (counted.length === 0 && !anyFood) {
    c.details = "No meal due yet";
    c.detailsHi = "अभी किसी भोजन का समय नहीं हुआ";
    c.noteEn = c.details;
    c.noteHi = c.detailsHi;
    return { comp: c };
  }

  c.applicable = counted.length > 0;
  c.completeness = counted.length > 0 ? (loggedCount / counted.length) * 100 : null;
  c.expected = counted.length;
  c.logged = loggedCount;
  if (!c.applicable) {
    // Only a snack/odd-hour entry so far: informational, not scored.
    c.status = "partial";
    c.details = `${foodLogs.length} item(s) logged`;
    c.detailsHi = `${foodLogs.length} व्यंजन दर्ज`;
    c.noteEn = "Food logged, but no main meal was due yet.";
    c.noteHi = "भोजन दर्ज है, पर किसी मुख्य भोजन का समय अभी नहीं हुआ।";
    return { comp: c, nutrition };
  }

  const missing = counted.filter((k) => !slotLogged[k]);
  if (missing.length === 0) {
    c.status = "completed";
    c.details = `${loggedCount} main meal(s) logged (${foodLogs.length} items)`;
    c.detailsHi = `${loggedCount} मुख्य भोजन दर्ज (${foodLogs.length} व्यंजन)`;
    c.positiveEn.push(`All main meals due so far were logged (${loggedCount}).`);
    c.positiveHi.push(`अब तक के सभी मुख्य भोजन दर्ज हुए (${loggedCount})।`);
  } else if (loggedCount > 0) {
    c.status = "partial";
    c.details = `${loggedCount} of ${counted.length} main meals logged`;
    c.detailsHi = `${counted.length} में से ${loggedCount} मुख्य भोजन दर्ज`;
  } else {
    c.status = "missing";
    c.details = "No main meal logged";
    c.detailsHi = "कोई मुख्य भोजन दर्ज नहीं";
  }
  for (const k of missing) {
    c.deductionEn.push(`${MEAL_LABEL_EN[k]} not logged.`);
    c.deductionHi.push(`${MEAL_LABEL_HI[k]} दर्ज नहीं है।`);
    c.missingHi.push(`${MEAL_LABEL_HI[k]}`);
  }

  // Calories are judged only once the day's intake is known (2+ main meals and the day is over/dinner logged).
  if (mainLogged >= 2 && dayComplete && goals.calorieTarget > 0) {
    const r = totalCal / goals.calorieTarget;
    if (r > CALORIE_RATIO.highOver) {
      c.health = 55;
      c.concern = "watch";
    } else if (r > CALORIE_RATIO.over) c.health = 80;
    else if (r >= CALORIE_RATIO.low) c.health = 100;
    else if (r >= CALORIE_RATIO.veryLow) c.health = 80;
    else {
      c.health = 55;
      c.concern = "watch";
    }
    const dir = r > CALORIE_RATIO.over ? "above" : r < CALORIE_RATIO.low ? "below" : "near";
    c.noteEn = `Day total ${Math.round(totalCal)} kcal vs target ${goals.calorieTarget} (${dir === "near" ? "near target" : dir + " target"}).`;
    c.noteHi = `दिन का कुल ${Math.round(totalCal)} kcal, लक्ष्य ${goals.calorieTarget} (${dir === "near" ? "लक्ष्य के पास" : dir === "above" ? "लक्ष्य से ज़्यादा" : "लक्ष्य से कम"})।`;
  } else {
    c.noteEn = `Logged ${loggedCount} of ${counted.length} main meals due so far; calories are judged once the day's meals are in.`;
    c.noteHi = `अब तक के ${counted.length} मुख्य भोजन में से ${loggedCount} दर्ज; कैलोरी का आकलन पूरे दिन का भोजन दर्ज होने पर होता है।`;
  }
  return { comp: c, nutrition };
}

// --- activity ---------------------------------------------------------------

function calcActivity(input: WellnessInput): CompCalc {
  const c = emptyComp();
  const { steps, nowMinutes, goals } = input;
  const isDue = nowMinutes === null || nowMinutes >= DUE_AT_MIN.steps;
  const logged = steps !== null && steps > 0;
  const goal = goals.stepGoal;

  if (logged) {
    const ratio = Math.min(1, steps / goal);
    const goalMet = steps >= goal * 0.9;
    if (isDue || goalMet) {
      c.applicable = true;
      c.completeness = 100;
      c.expected = 1;
      c.logged = 1;
      c.health = Math.round(ratio * 100);
      c.status = goalMet ? "completed" : "partial";
      c.details = `${steps.toLocaleString("en-IN")} steps (${Math.round(ratio * 100)}% of ${goal.toLocaleString("en-IN")})`;
      c.detailsHi = `${steps.toLocaleString("en-IN")} कदम (लक्ष्य ${goal.toLocaleString("en-IN")} का ${Math.round(ratio * 100)}%)`;
      if (goalMet) {
        c.positiveEn.push(`Step goal reached (${steps.toLocaleString("en-IN")} / ${goal.toLocaleString("en-IN")}).`);
        c.positiveHi.push(`कदम का लक्ष्य पूरा हुआ (${steps.toLocaleString("en-IN")} / ${goal.toLocaleString("en-IN")})।`);
      } else {
        c.deductionEn.push(`Steps below goal (${steps.toLocaleString("en-IN")} / ${goal.toLocaleString("en-IN")}).`);
        c.deductionHi.push(`कदम लक्ष्य से कम रहे (${steps.toLocaleString("en-IN")} / ${goal.toLocaleString("en-IN")})।`);
      }
      c.noteEn = `Steps vs the patient's goal of ${goal.toLocaleString("en-IN")}.`;
      c.noteHi = `कदम, मरीज़ के लक्ष्य ${goal.toLocaleString("en-IN")} की तुलना में।`;
    } else {
      c.status = "partial";
      c.details = `${steps.toLocaleString("en-IN")} steps so far`;
      c.detailsHi = `अब तक ${steps.toLocaleString("en-IN")} कदम`;
      c.noteEn = "Steps are a day total; judged in the evening.";
      c.noteHi = "कदम पूरे दिन का योग हैं; शाम को आकलन होता है।";
    }
    return c;
  }

  if (isDue) {
    c.applicable = true;
    c.completeness = 0;
    c.expected = 1;
    c.status = "missing";
    c.details = "Steps not logged";
    c.detailsHi = "कदम दर्ज नहीं हैं";
    c.deductionEn.push("Steps were not logged.");
    c.deductionHi.push("कदम दर्ज नहीं हुए।");
    c.missingHi.push("कदम / गतिविधि");
    c.noteEn = "Steps not logged.";
    c.noteHi = "कदम दर्ज नहीं हुए।";
  } else {
    c.details = "Steps due this evening";
    c.detailsHi = "कदम शाम को दर्ज करने हैं";
    c.noteEn = c.details;
    c.noteHi = c.detailsHi;
  }
  return c;
}

// --- sleep ------------------------------------------------------------------

function calcSleep(input: WellnessInput): CompCalc {
  const c = emptyComp();
  const { sleepHours, nowMinutes, goals } = input;
  const isDue = nowMinutes === null || nowMinutes >= DUE_AT_MIN.sleep;

  if (sleepHours !== null && sleepHours > 0) {
    const target = Math.max(1, goals.sleepTarget);
    let health = Math.min(1, sleepHours / target) * 100;
    if (sleepHours < SLEEP_SHORT_HOURS) health = Math.min(health, 60);
    if (sleepHours > SLEEP_LONG_HOURS) health = Math.min(health, 80);
    c.applicable = true;
    c.completeness = 100;
    c.expected = 1;
    c.logged = 1;
    c.health = Math.round(health);
    c.status = c.health >= 85 ? "completed" : "partial";
    c.details = `${sleepHours} hrs (target ${target})`;
    c.detailsHi = `${sleepHours} घंटे नींद (लक्ष्य ${target} घंटे)`;
    if (sleepHours < SLEEP_SHORT_HOURS) {
      c.concern = "watch";
      c.deductionEn.push(`Short sleep (${sleepHours} hrs).`);
      c.deductionHi.push(`नींद कम रही (${sleepHours} घंटे)।`);
    } else if (sleepHours > SLEEP_LONG_HOURS) {
      c.concern = "watch";
      c.deductionEn.push(`Unusually long sleep (${sleepHours} hrs).`);
      c.deductionHi.push(`नींद सामान्य से बहुत ज़्यादा रही (${sleepHours} घंटे)।`);
    } else if (c.status === "completed") {
      c.positiveEn.push(`Sleep ${sleepHours} hrs, close to the ${target}-hour target.`);
      c.positiveHi.push(`नींद ${sleepHours} घंटे, ${target} घंटे के लक्ष्य के पास।`);
    }
    c.noteEn = `Sleep vs the ${target}-hour target; under ${SLEEP_SHORT_HOURS} h or over ${SLEEP_LONG_HOURS} h is marked down.`;
    c.noteHi = `नींद, ${target} घंटे के लक्ष्य की तुलना में; ${SLEEP_SHORT_HOURS} घंटे से कम या ${SLEEP_LONG_HOURS} घंटे से ज़्यादा पर अंक कम।`;
    return c;
  }
  if (isDue) {
    c.applicable = true;
    c.completeness = 0;
    c.expected = 1;
    c.status = "missing";
    c.details = "Sleep not logged";
    c.detailsHi = "नींद दर्ज नहीं है";
    c.deductionEn.push("Sleep was not logged.");
    c.deductionHi.push("नींद दर्ज नहीं हुई।");
    c.missingHi.push("नींद");
    c.noteEn = "Sleep not logged.";
    c.noteHi = "नींद दर्ज नहीं हुई।";
  } else {
    c.details = "Sleep due this morning";
    c.detailsHi = "नींद सुबह दर्ज करनी है";
    c.noteEn = c.details;
    c.noteHi = c.detailsHi;
  }
  return c;
}

// --- blood pressure ---------------------------------------------------------

function calcBP(input: WellnessInput): { comp: CompCalc; alerts: WellnessAlert[]; worst: BPClassification | null } {
  const c = emptyComp();
  const alerts: WellnessAlert[] = [];
  const plausible = input.bpReadings.filter((r) => isPlausibleBP(r.systolic, r.diastolic, r.pulse));
  const dropped = input.bpReadings.length - plausible.length;
  const status = evaluateBPSchedule(
    input.bpSchedule,
    input.bpReadings.map((r) => ({ readingType: r.readingType, minutesOfDay: r.minutesOfDay })),
    input.nowMinutes,
  );

  let worst: BPClassification | null = null;
  if (plausible.length > 0) {
    const classes = plausible.map((r) => ({ r, cls: classifyBP(r.systolic, r.diastolic, input.bpThresholds) }));
    const qualities = classes.map((x) => bpQuality(x.cls));
    c.health = Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length);
    worst = classes.reduce((a, b) => (b.cls.severity > a.cls.severity ? b : a)).cls;
    const top = classes.reduce((a, b) => (b.cls.severity > a.cls.severity ? b : a));

    const label = (x: (typeof classes)[number]) => `${x.r.systolic}/${x.r.diastolic}`;
    const listHi = classes.map(label).join(", ");
    c.noteEn = `BP ${classes.map(label).join(", ")} vs this patient's target ${input.bpThresholds.target_systolic}/${input.bpThresholds.target_diastolic}: ${top.cls.labelEn}.`;
    c.noteHi = `BP ${listHi}, मरीज़ के लक्ष्य ${input.bpThresholds.target_systolic}/${input.bpThresholds.target_diastolic} के सामने: ${top.cls.labelHi}।`;

    if (top.cls.category === "crisis") {
      c.concern = "alert";
      alerts.push({
        severity: "URGENT",
        messageEn: `BP ${top.r.systolic}/${top.r.diastolic} is in the crisis range. Recheck after resting; if it stays this high or there are symptoms (headache, chest pain, weakness, speech or vision trouble) get medical help immediately.`,
        messageHi: `BP ${top.r.systolic}/${top.r.diastolic} बहुत ज़्यादा (क्राइसिस रेंज) है। आराम के बाद दोबारा नापें; अगर इतना ही रहे या सिरदर्द, सीने में दर्द, कमज़ोरी, बोलने/देखने में दिक्कत हो तो तुरंत डॉक्टर/अस्पताल से संपर्क करें।`,
      });
    } else if (top.cls.exceedsAlert || (top.cls.category === "low" && top.cls.needsUrgentAttention)) {
      c.concern = "alert";
      alerts.push({
        severity: "IMPORTANT",
        messageEn: `BP ${top.r.systolic}/${top.r.diastolic} is ${top.cls.category === "low" ? "low" : "above the alert line"} for this patient. Recheck and tell the doctor.`,
        messageHi: `BP ${top.r.systolic}/${top.r.diastolic} इस मरीज़ के लिए ${top.cls.category === "low" ? "कम" : "अलर्ट सीमा से ज़्यादा"} है। दोबारा नापें और डॉक्टर को बताएँ।`,
      });
    } else if (top.cls.aboveTarget || top.cls.category === "low") {
      c.concern = "watch";
    }
    if (c.concern === "none") {
      c.positiveEn.push("BP within the patient's target range.");
      c.positiveHi.push("BP मरीज़ के लक्ष्य की सीमा में रहा।");
    } else {
      c.deductionEn.push(`BP ${top.r.systolic}/${top.r.diastolic}: ${top.cls.labelEn}.`);
      c.deductionHi.push(`BP ${top.r.systolic}/${top.r.diastolic}: ${top.cls.labelHi}।`);
    }
    const pulseBad = plausible.find((r) => r.pulse !== null && classifyPulse(r.pulse).category !== "normal");
    if (pulseBad && pulseBad.pulse !== null) {
      const p = classifyPulse(pulseBad.pulse);
      c.concern = c.concern === "alert" ? "alert" : "watch";
      c.deductionEn.push(`${p.labelEn} (${pulseBad.pulse} bpm).`);
      c.deductionHi.push(`${p.labelHi} (${pulseBad.pulse} bpm)।`);
    }
  }
  if (dropped > 0) {
    c.deductionEn.push(`${dropped} BP reading(s) look like entry errors and were not scored.`);
    c.deductionHi.push(`${dropped} BP माप गलत एंट्री जैसे लगे, इसलिए अंक में नहीं गिने।`);
  }

  if (status.completeness === null && plausible.length === 0) {
    c.details = "BP not due yet";
    c.detailsHi = "BP का समय अभी नहीं हुआ";
    if (!c.noteEn) {
      c.noteEn = c.details;
      c.noteHi = c.detailsHi;
    }
    return { comp: c, alerts, worst };
  }

  c.applicable = true;
  c.completeness = status.completeness === null ? 100 : status.completeness * 100;
  c.expected = Math.max(status.expectedDue, input.bpReadings.length > 0 ? 1 : 0);
  c.logged = status.loggedDue;
  const missingSlots = status.slots.filter((s) => s.due && !s.logged);
  c.status = missingSlots.length === 0 ? "completed" : status.loggedDue > 0 ? "partial" : "missing";
  c.details =
    input.bpReadings.length > 0
      ? `${input.bpReadings.length} reading(s) logged${worst ? ` (${worst.labelEn})` : ""}`
      : "BP not logged";
  c.detailsHi =
    input.bpReadings.length > 0
      ? `${input.bpReadings.length} BP माप दर्ज${worst ? ` (${worst.labelHi})` : ""}`
      : "BP दर्ज नहीं है";
  for (const slot of missingSlots) {
    const hi = slot.slot === "morning" ? "सुबह का BP" : "शाम का BP";
    const en = slot.slot === "morning" ? "Morning BP" : "Evening BP";
    c.deductionEn.push(`${en} not logged.`);
    c.deductionHi.push(`${hi} दर्ज नहीं हुआ।`);
    c.missingHi.push(hi);
  }
  if (!c.noteEn) {
    c.noteEn = "BP not logged.";
    c.noteHi = "BP दर्ज नहीं हुआ।";
  }
  return { comp: c, alerts, worst };
}

// --- weight -----------------------------------------------------------------

function calcWeight(input: WellnessInput): CompCalc {
  const c = emptyComp();
  const { date, nowMinutes, recentWeights } = input;
  const inWeek = recentWeights.filter((w) => w.date <= date && ageInDays(w.date, date) <= WEIGHT_FRESH_DAYS);
  const today = inWeek.find((w) => w.date === date);
  const latest = inWeek.length > 0 ? inWeek[inWeek.length - 1] : null;

  if (today) {
    c.applicable = true;
    c.completeness = 100;
    c.expected = 1;
    c.logged = 1;
    c.status = "completed";
    c.details = `${today.kg} kg logged`;
    c.detailsHi = `${today.kg} kg दर्ज`;
    const first = inWeek[0];
    const change = round(today.kg - first.kg, 1);
    if (inWeek.length >= 2 && Math.abs(change) >= WEIGHT_RAPID_KG_7D) {
      c.health = 60;
      c.concern = "watch";
      c.deductionEn.push(`Weight changed ${change > 0 ? "+" : ""}${change} kg within a week.`);
      c.deductionHi.push(`एक हफ्ते में वज़न ${change > 0 ? "+" : ""}${change} kg बदला।`);
      c.noteEn = `Weight moved ${change} kg in 7 days (flag at ${WEIGHT_RAPID_KG_7D} kg).`;
      c.noteHi = `7 दिनों में वज़न ${change} kg बदला (${WEIGHT_RAPID_KG_7D} kg पर चेतावनी)।`;
    } else {
      c.health = 100;
      c.positiveEn.push("Weight logged and steady.");
      c.positiveHi.push("वज़न दर्ज हुआ और स्थिर है।");
      c.noteEn = "Weight logged; no rapid change in the last 7 days.";
      c.noteHi = "वज़न दर्ज; पिछले 7 दिनों में कोई तेज़ बदलाव नहीं।";
    }
    return c;
  }
  if (latest) {
    const age = ageInDays(latest.date, date);
    c.details = `Last weight ${latest.kg} kg, ${age} day(s) ago`;
    c.detailsHi = `पिछला वज़न ${latest.kg} kg, ${age} दिन पहले`;
    c.noteEn = "Weight is checked about weekly; a recent reading exists, so it is not required today.";
    c.noteHi = "वज़न हफ्ते में एक बार नापना काफ़ी है; हाल का माप मौजूद है, आज ज़रूरी नहीं।";
    return c;
  }
  const isDue = nowMinutes === null || nowMinutes >= DUE_AT_MIN.weight;
  if (isDue) {
    c.applicable = true;
    c.completeness = 0;
    c.expected = 1;
    c.status = "missing";
    c.details = "No weight in the last 7 days";
    c.detailsHi = "पिछले 7 दिनों में वज़न दर्ज नहीं";
    c.deductionEn.push("No weight logged in the last 7 days.");
    c.deductionHi.push("पिछले 7 दिनों में वज़न दर्ज नहीं हुआ।");
    c.missingHi.push("वज़न");
    c.noteEn = "No weight in 7 days.";
    c.noteHi = "7 दिनों से वज़न दर्ज नहीं।";
  } else {
    c.details = "Weight check due";
    c.detailsHi = "वज़न नापना बाकी";
    c.noteEn = c.details;
    c.noteHi = c.detailsHi;
  }
  return c;
}

// ---------------------------------------------------------------------------

function percentOf(c: CompCalc): number {
  if (!c.applicable || c.completeness === null || c.completeness === 0) return 0;
  const h = c.health ?? c.completeness;
  return Math.round(WELLNESS_COMPLETENESS_WEIGHT * c.completeness + WELLNESS_HEALTH_WEIGHT * h);
}

const LABELS: Record<ComponentKey, { hi: string; en: string }> = {
  medicine: { hi: "दवाइयाँ", en: "Medicines" },
  food: { hi: "भोजन", en: "Food" },
  activity: { hi: "गतिविधि", en: "Activity" },
  sleep: { hi: "नींद", en: "Sleep" },
  bp: { hi: "रक्तचाप", en: "Blood pressure" },
  weight: { hi: "वज़न", en: "Weight" },
};

export function computeDailyWellness(input: WellnessInput): DailyWellnessScoreResult {
  const weights = input.weights ?? DEFAULT_SCORE_WEIGHTS;
  const maxScore = weights.medicine + weights.food + weights.activity + weights.sleep + weights.bp + weights.weight;

  const food = calcFood(input);
  const bp = calcBP(input);
  const calcs: Record<ComponentKey, CompCalc> = {
    medicine: calcMedicine(input),
    food: food.comp,
    activity: calcActivity(input),
    sleep: calcSleep(input),
    bp: bp.comp,
    weight: calcWeight(input),
  };
  const keys = Object.keys(calcs) as ComponentKey[];

  const scoredKeys = keys.filter((k) => calcs[k].applicable);
  const scoredWeight = scoredKeys.reduce((s, k) => s + weights[k], 0);
  const percents = Object.fromEntries(keys.map((k) => [k, percentOf(calcs[k])])) as Record<ComponentKey, number>;

  let total = scoredWeight > 0 ? scoredKeys.reduce((s, k) => s + weights[k] * percents[k], 0) / scoredWeight : 0;

  const completenessKeys = scoredKeys.filter((k) => calcs[k].completeness !== null);
  const dataCompleteness =
    scoredWeight > 0
      ? Math.round(completenessKeys.reduce((s, k) => s + weights[k] * (calcs[k].completeness as number), 0) / scoredWeight)
      : 0;
  const healthKeys = scoredKeys.filter((k) => calcs[k].health !== null);
  const healthWeight = healthKeys.reduce((s, k) => s + weights[k], 0);
  const healthStatusScore =
    healthWeight > 0
      ? Math.round(healthKeys.reduce((s, k) => s + weights[k] * (calcs[k].health as number), 0) / healthWeight)
      : null;

  // Anything logged counts as data; a day with nothing logged is "no data", not a zero.
  const anyLogged =
    input.doses.some((d) => d.hasRealLog) ||
    input.foodLogs.length > 0 ||
    (input.steps ?? 0) > 0 ||
    (input.sleepHours ?? 0) > 0 ||
    input.bpReadings.length > 0 ||
    input.recentWeights.some((w) => w.date === input.date);
  const isSufficient = anyLogged && scoredWeight > 0;

  // Safety caps from BP.
  let scoreCap: DailyWellnessScoreResult["scoreCap"] = null;
  const alerts = [...bp.alerts];
  if (bp.worst?.category === "crisis") {
    scoreCap = {
      cap: WELLNESS_CRISIS_CAP,
      reasonHi: "BP क्राइसिस रेंज में है, इसलिए आज का स्कोर सीमित किया गया।",
      reasonEn: "BP is in the crisis range, so today's score is capped.",
    };
  } else if (bp.worst && (bp.worst.exceedsAlert || (bp.worst.category === "low" && bp.worst.needsUrgentAttention))) {
    scoreCap = {
      cap: WELLNESS_ALERT_BP_CAP,
      reasonHi: "BP अलर्ट सीमा के बाहर है, इसलिए आज का स्कोर सीमित किया गया।",
      reasonEn: "BP is outside the alert line, so today's score is capped.",
    };
  }
  if (scoreCap && total > scoreCap.cap) total = scoreCap.cap;
  const totalScore = isSufficient ? Math.round(total) : 0;

  const cat = isSufficient
    ? getScoreCategory(totalScore)
    : { category: "Not enough data yet" as ConsistencyCategory, categoryHi: "पर्याप्त डेटा नहीं" };

  const components = Object.fromEntries(
    keys.map((k) => {
      const c = calcs[k];
      const percent = percents[k];
      const comp: ComponentScoreBreakdown = {
        score: c.applicable ? round((percent / 100) * weights[k], 1) : 0,
        maxScore: weights[k],
        percent,
        status: c.status,
        details: c.details,
        detailsHi: c.detailsHi,
        completenessPct: c.completeness === null ? null : Math.round(c.completeness),
        healthPct: c.health === null ? null : Math.round(c.health),
        isScored: c.applicable,
        concern: c.concern,
        expectedItems: c.expected,
        loggedItems: c.logged,
      };
      return [k, comp];
    }),
  ) as Record<ComponentKey, ComponentScoreBreakdown>;

  const breakdown: WellnessBreakdownItem[] = keys.map((k) => {
    const c = calcs[k];
    return {
      key: k,
      labelHi: LABELS[k].hi,
      labelEn: LABELS[k].en,
      weight: weights[k],
      isScored: c.applicable,
      completenessPct: components[k].completenessPct,
      healthPct: components[k].healthPct,
      percent: percents[k],
      contributionPts: c.applicable && scoredWeight > 0 ? round((weights[k] * percents[k]) / scoredWeight, 1) : 0,
      noteHi: c.noteHi || c.detailsHi,
      noteEn: c.noteEn || c.details,
    };
  });

  const positiveHi = keys.flatMap((k) => calcs[k].positiveHi);
  const positiveEn = keys.flatMap((k) => calcs[k].positiveEn);
  const deductionHi = keys.flatMap((k) => calcs[k].deductionHi);
  const deductionEn = keys.flatMap((k) => calcs[k].deductionEn);
  if (scoreCap) {
    deductionHi.unshift(scoreCap.reasonHi);
    deductionEn.unshift(scoreCap.reasonEn);
  }

  return {
    date: input.date,
    patientId: input.patientId,
    totalScore,
    maxScore,
    category: cat.category,
    categoryHi: cat.categoryHi,
    components,
    reasons: { positive: positiveHi, deductions: deductionHi },
    reasonsEn: { positive: positiveEn, deductions: deductionEn },
    missingDataItems: keys.flatMap((k) => calcs[k].missingHi),
    nutritionContext: food.nutrition,
    calculationVersion: "v2",
    calculatedAt: input.calculatedAt ?? new Date().toISOString(),
    isSufficient,
    insufficientReasonHi: isSufficient ? undefined : "इस दिन का अभी कोई रिकॉर्ड दर्ज नहीं है।",
    insufficientReasonEn: isSufficient ? undefined : "Nothing has been logged for this day yet.",
    dataCompleteness,
    itemsExpected: scoredKeys.reduce((s, k) => s + calcs[k].expected, 0),
    itemsLogged: scoredKeys.reduce((s, k) => s + calcs[k].logged, 0),
    healthStatusScore,
    scoredWeightPct: maxScore > 0 ? Math.round((scoredWeight / maxScore) * 100) : 0,
    scoreCap,
    breakdown,
    alerts,
    isToday: input.nowMinutes !== null,
  };
}
