/**
 * Period roll-ups for weekly / monthly / yearly reports (pure). One definition
 * of "average score": the mean of the daily wellness scores over days that have
 * any data. Adherence is taken + late over doses that were due. Windows are IST
 * calendar days.
 */
import {
  ADHERENCE_GOOD_PCT,
  ADHERENCE_LOW_PCT,
  STEPS_GOAL_MET_RATIO,
  WEIGHT_RAPID_KG_7D,
  WEIGHT_STABLE_KG,
  bpScheduleSlots,
  classifyBP,
  isPlausibleBP,
  round,
  type BPSchedule,
  type BPThresholds,
} from "../health-rules";
import { summarizeAdherence, type AdherenceSummary, type DoseRecord } from "./adherence";
import type { DailyWellnessScoreResult } from "./wellness-calc";

export interface PeriodInput {
  dates: string[];
  today: string;
  scores: DailyWellnessScoreResult[];
  bp: Array<{ day: string; systolic: number; diastolic: number }>;
  weights: Array<{ day: string; kg: number }>;
  food: Array<{ day: string; calories: number }>;
  steps: Array<{ day: string; steps: number }>;
  sleep: Array<{ day: string; hours: number }>;
  doses: DoseRecord[];
  goals: { stepGoal: number };
  thresholds: BPThresholds;
  bpSchedule: BPSchedule;
}

export interface PeriodStats {
  totalDays: number;
  scoredDays: number;
  averageScore: number;
  highest: { score: number; date: string } | null;
  lowest: { score: number; date: string } | null;
  adherence: AdherenceSummary;
  foodDays: number;
  activityDays: number;
  sleepDays: number;
  bpDays: number;
  weightDays: number;
  averageCalories: number | null;
  averageSteps: number | null;
  averageSleepHours: number | null;
  bpCount: number;
  bpAboveAlert: number;
  bpCrisis: number;
  start: { kg: number; day: string } | null;
  end: { kg: number; day: string } | null;
  weightChangeKg: number | null;
}

const uniq = (xs: string[]) => new Set(xs).size;
const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarizePeriod(p: PeriodInput): PeriodStats {
  const scored = p.scores.filter((s) => s.isSufficient);
  const sortedScored = [...scored].sort((a, b) => b.totalScore - a.totalScore);

  // A partial today is not a full day of food: only use it once the day's meals can be judged.
  const calorieDays = new Map<string, number>();
  for (const f of p.food) calorieDays.set(f.day, (calorieDays.get(f.day) ?? 0) + (f.calories || 0));
  const completeCalories = [...calorieDays.entries()]
    .filter(([day, kcal]) => {
      if (kcal <= 0) return false;
      if (day !== p.today) return true;
      return p.scores.find((s) => s.date === day)?.components.food.healthPct != null;
    })
    .map(([, kcal]) => kcal);

  const stepsLogged = p.steps.filter((s) => s.steps > 0);
  const sleepLogged = p.sleep.filter((s) => s.hours > 0);
  const plausibleBP = p.bp.filter((b) => isPlausibleBP(b.systolic, b.diastolic));
  const cls = plausibleBP.map((b) => classifyBP(b.systolic, b.diastolic, p.thresholds));

  const w = [...p.weights].sort((a, b) => a.day.localeCompare(b.day));
  const first = w[0] ?? null;
  const last = w[w.length - 1] ?? null;
  const enoughWeights = first && last && w.length >= 2 && first.day !== last.day;

  const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, r) => s + r.totalScore, 0) / scored.length) : 0;

  return {
    totalDays: p.dates.length,
    scoredDays: scored.length,
    averageScore: avgScore,
    highest: sortedScored[0] ? { score: sortedScored[0].totalScore, date: sortedScored[0].date } : null,
    lowest: sortedScored.length ? { score: sortedScored[sortedScored.length - 1].totalScore, date: sortedScored[sortedScored.length - 1].date } : null,
    adherence: summarizeAdherence(p.doses),
    foodDays: uniq(p.food.map((f) => f.day)),
    activityDays: uniq(stepsLogged.map((s) => s.day)),
    sleepDays: uniq(sleepLogged.map((s) => s.day)),
    bpDays: uniq(plausibleBP.map((b) => b.day)),
    weightDays: uniq(w.map((x) => x.day)),
    averageCalories: completeCalories.length ? Math.round(meanOf(completeCalories) as number) : null,
    averageSteps: stepsLogged.length ? Math.round(meanOf(stepsLogged.map((s) => s.steps)) as number) : null,
    averageSleepHours: sleepLogged.length ? round(meanOf(sleepLogged.map((s) => s.hours)) as number, 1) : null,
    bpCount: plausibleBP.length,
    bpAboveAlert: cls.filter((c) => c.exceedsAlert).length,
    bpCrisis: cls.filter((c) => c.category === "crisis").length,
    start: first ? { kg: first.kg, day: first.day } : null,
    end: last ? { kg: last.kg, day: last.day } : null,
    weightChangeKg: enoughWeights ? round((last as { kg: number }).kg - (first as { kg: number }).kg, 1) : null,
  };
}

/** Report insights (Hindi). Every line is backed by data in the period; there is no padding. */
export function periodInsights(p: PeriodInput, s: PeriodStats, label: "हफ्ते" | "महीने"): string[] {
  const out: string[] = [];
  const ad = s.adherence;
  if (ad.evaluated >= 3 && ad.pct !== null) {
    if (ad.pct >= ADHERENCE_GOOD_PCT) out.push(`इस ${label} दवाइयाँ नियमित रहीं: ${ad.evaluated} में से ${ad.adherent} खुराकें ली गईं (${ad.pct}%)।`);
    else if (ad.pct < ADHERENCE_LOW_PCT) out.push(`इस ${label} दवाइयों की नियमितता ${ad.pct}% रही (${ad.evaluated} में से ${ad.adherent} खुराकें) — नियमित पुष्टि पर ध्यान दें।`);
    else out.push(`इस ${label} दवाइयों की नियमितता ${ad.pct}% रही (${ad.evaluated} में से ${ad.adherent} खुराकें)।`);
  }

  if (s.bpCrisis > 0) out.push(`${s.bpCrisis} BP माप क्राइसिस रेंज में रहे — डॉक्टर को ज़रूर दिखाएँ।`);
  else if (s.bpAboveAlert > 0) out.push(`${s.bpAboveAlert} BP माप अलर्ट सीमा (${p.thresholds.alert_systolic}/${p.thresholds.alert_diastolic}) से ऊपर रहे।`);

  const slots = bpScheduleSlots(p.bpSchedule).slots.length;
  const expectedBP = slots * p.dates.length;
  if (s.bpCount > 0 && expectedBP > 0) {
    if (s.bpCount >= expectedBP * 0.8) out.push(`BP नियमित रूप से नापा गया: ${s.bpCount} माप (अपेक्षित ~${expectedBP})।`);
    else if (s.bpCount < expectedBP * 0.5) out.push(`BP कम बार नापा गया: ${s.bpCount} माप (अपेक्षित ~${expectedBP})। तय समय पर नापने का प्रयास करें।`);
  }

  if (s.averageSteps !== null) {
    if (s.averageSteps >= p.goals.stepGoal * STEPS_GOAL_MET_RATIO) out.push(`कदम का लक्ष्य लगभग पूरा रहा: औसत ${s.averageSteps.toLocaleString("en-IN")} कदम/दिन (लक्ष्य ${p.goals.stepGoal.toLocaleString("en-IN")})।`);
    else out.push(`औसत ${s.averageSteps.toLocaleString("en-IN")} कदम/दिन रहे (लक्ष्य ${p.goals.stepGoal.toLocaleString("en-IN")})।`);
  }

  if (s.weightChangeKg !== null) {
    const days = Math.max(1, Math.round((Date.parse(s.end!.day) - Date.parse(s.start!.day)) / 86_400_000));
    if (Math.abs(s.weightChangeKg) <= WEIGHT_STABLE_KG) out.push(`वज़न स्थिर रहा (${s.start!.kg} → ${s.end!.kg} kg)।`);
    else if (days <= 7 && Math.abs(s.weightChangeKg) >= WEIGHT_RAPID_KG_7D)
      out.push(`वज़न ${days} दिनों में ${s.weightChangeKg > 0 ? "+" : ""}${s.weightChangeKg} kg बदला — यह तेज़ बदलाव है, डॉक्टर को बताएँ।`);
    else out.push(`वज़न ${s.weightChangeKg > 0 ? "बढ़ा" : "घटा"}: ${s.start!.kg} → ${s.end!.kg} kg (${s.weightChangeKg > 0 ? "+" : ""}${s.weightChangeKg} kg)।`);
  }

  const foodPct = Math.round((s.foodDays / p.dates.length) * 100);
  if (s.foodDays > 0 && foodPct < 60) out.push(`भोजन केवल ${s.foodDays} / ${p.dates.length} दिन दर्ज हुआ।`);

  if (out.length === 0) out.push("इस अवधि में तुलना या निष्कर्ष के लिए पर्याप्त रिकॉर्ड नहीं हैं।");
  return out;
}

export function formatDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export function formatRangeLabel(start: string, end: string): string {
  const f = (date: string, withYear: boolean) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: withYear ? "numeric" : undefined,
      timeZone: "UTC",
    });
  };
  return `${f(start, false)} – ${f(end, true)}`;
}
