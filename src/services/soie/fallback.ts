/**
 * Deterministic rule engine. PURE.
 *
 * Used when there is no API key, the model is unreachable, or an AI answer
 * failed verification twice. It understands Hindi / Hinglish / English /
 * Devanagari by whole-token matching (normalize.ts) and IST-correct dates
 * (temporal.ts), then renders every answer from the fact ledger with bilingual
 * templates. It never calls a model, never guesses a date, and never states a
 * number the ledger did not compute.
 *
 * It is deliberately less capable than the AI path (no internet, no open-ended
 * advice). Where a question needs that, it says so instead of improvising.
 */

import {
  MEDICINE_LATE_AFTER_MIN,
  SLEEP_SHORT_HOURS,
  SODIUM_IDEAL_MG_PER_DAY,
  SODIUM_LIMIT_MG_PER_DAY,
  WEIGHT_STABLE_KG,
  addDaysIST,
  classifyBP,
  daysBetweenIST,
  round,
} from "@/lib/health-rules";
import {
  activityStats,
  adherenceStats,
  agoLabel,
  bpStats,
  completeness,
  inRange,
  nutritionStats,
  sleepStats,
  weightStats,
} from "./ledger";
import { frequencyLabel, mealRelationLabel } from "@/lib/medicine-format";
import { containsAnyPhrase, detectIntents, detectMetrics, hasHealthAnchor, hasPhrase, fold, suggestCorrections, type Intent } from "./normalize";
import { assessSafety, readingsInMessage } from "./safety";
import { contentTokens, detectAdviceQuestion, detectMemoryLookup, detectOffTopic, detectScheduleQuestion, detectSmallTalk, detectSymptomMention, detectTakeWhen, detectUntracked, matchMedicines, type UntrackedTopic } from "./scope";
import { formatDateEn, formatDateHi, resolveTemporal, startOfISOWeek, type Span } from "./temporal";
import type {
  AnswerDraft,
  AnswerNumber,
  KeyPoint,
  Ledger,
  MedicineInfo,
  Metric,
  PatientContext,
  Recommendation,
  SafetyAssessment,
} from "./types";

export interface Bi {
  hi: string;
  en: string;
}

interface Section extends Bi {
  kp: KeyPoint[];
  nums: AnswerNumber[];
  metrics: Metric[];
  n: number;
}

export interface FallbackInput {
  message: string;
  ctx: PatientContext;
  ledger: Ledger;
  safety?: SafetyAssessment;
}

export interface FallbackResult {
  answer: AnswerDraft;
  /** Short machine label of what was understood (telemetry + eval). */
  intent: string;
  metrics: Metric[];
  spans: Array<{ from: string; to: string }>;
}

type Mode = "latest" | "value" | "average" | "trend" | "compare" | "goal" | "adherence" | "missing" | "summary" | "advice" | "extreme";

const METRIC_NAME: Record<Metric, Bi> = {
  bp: { hi: "BP", en: "BP" },
  pulse: { hi: "नब्ज़", en: "pulse" },
  weight: { hi: "वज़न", en: "weight" },
  food: { hi: "खाना / कैलोरी", en: "food / calories" },
  sleep: { hi: "नींद", en: "sleep" },
  steps: { hi: "कदम", en: "steps" },
  medicine: { hi: "दवा", en: "medicines" },
};

const MEAL_WORDS: Array<{ key: string; words: string[]; hi: string; en: string }> = [
  { key: "breakfast", words: ["breakfast", "nashta", "nasta", "naashta", "नाश्ता", "नाश्ते", "नास्ता"], hi: "नाश्ता", en: "breakfast" },
  { key: "lunch", words: ["lunch", "dopahar ka khana", "दोपहर का खाना", "लंच"], hi: "दोपहर का खाना", en: "lunch" },
  { key: "dinner", words: ["dinner", "raat ka khana", "रात का खाना", "डिनर"], hi: "रात का खाना", en: "dinner" },
  { key: "snack", words: ["snack", "snacks", "स्नैक", "स्नैक्स"], hi: "स्नैक", en: "snack" },
];

/** "पिछला सप्ताह (Previous week)" -> {hi, en}; notes without a trailing "(...)" are used for both. */
function noteBi(note: string): Bi {
  const m = /^(.*?)\s*\((.*)\)$/.exec(note);
  return m && m[1] ? { hi: m[1], en: m[2] } : { hi: note, en: note };
}

const d = (date: string): Bi => ({ hi: formatDateHi(date), en: formatDateEn(date) });
const spanLabel = (s: { from: string; to: string }): Bi =>
  s.from === s.to ? d(s.from) : { hi: `${formatDateHi(s.from)} – ${formatDateHi(s.to)}`, en: `${formatDateEn(s.from)} – ${formatDateEn(s.to)}` };

/** Standard window key when [from,to] ends today and spans a standard length. */
function windowKey(ctx: PatientContext, s: { from: string; to: string }): string | null {
  if (s.to !== ctx.today) return null;
  const n = daysBetweenIST(s.from, s.to) + 1;
  return ({ 1: "today", 7: "7d", 14: "14d", 30: "30d", 90: "90d" } as Record<number, string>)[n] ?? null;
}

function factRefs(ledger: Ledger, ids: string[]): string[] {
  return ids.filter((id) => ledger.byId[id]);
}

const noData = (metric: Metric, s: { from: string; to: string }, ctx: PatientContext): Section => {
  const comp = completeness(ctx);
  const last = comp.lastDate[metric];
  const lbl = spanLabel(s);
  return {
    hi: `${lbl.hi} में ${METRIC_NAME[metric].hi} का डेटा दर्ज नहीं है।${last ? ` इसकी सबसे हाल की एंट्री ${formatDateHi(last)} की है।` : " अभी तक इसकी कोई एंट्री दर्ज नहीं है।"}`,
    en: `No ${METRIC_NAME[metric].en} data is logged for ${lbl.en}.${last ? ` The most recent entry is from ${formatDateEn(last)}.` : " There are no entries yet."}`,
    kp: [],
    nums: [],
    metrics: [metric],
    n: 0,
  };
};

// ---------------------------------------------------------------------------
// Per-metric sections
// ---------------------------------------------------------------------------

function bpSection(ctx: PatientContext, ledger: Ledger, s: { from: string; to: string } | null, mode: Mode): Section {
  const th = ctx.goals.bp;
  if (!s || mode === "latest") {
    const r = ctx.bp[ctx.bp.length - 1];
    if (!r) return noData("bp", { from: ctx.range.from, to: ctx.today }, ctx);
    const age = (new Date(ctx.generatedAt).getTime() - new Date(r.at).getTime()) / 60000;
    const cls = classifyBP(r.systolic, r.diastolic, th);
    return {
      hi: `आख़िरी दर्ज BP ${r.systolic}/${r.diastolic} mmHg है (${formatDateHi(r.date)}, ${r.time}; ${agoLabel(age, "hi")}) — ${cls.labelHi}।` + (r.pulse !== null ? ` नब्ज़ ${r.pulse}।` : ""),
      en: `The latest logged BP is ${r.systolic}/${r.diastolic} mmHg (${formatDateEn(r.date)}, ${r.time}; ${agoLabel(age, "en")}): ${cls.labelEn}.` + (r.pulse !== null ? ` Pulse ${r.pulse}.` : ""),
      kp: [{ text: `आख़िरी BP ${r.systolic}/${r.diastolic} (${r.date} ${r.time})`, fact_refs: [r.ref, ...factRefs(ledger, ["bp.latest"])] }],
      nums: [
        { label: "सिस्टोलिक BP", value: r.systolic, unit: "mmHg", ref: r.ref },
        { label: "डायस्टोलिक BP", value: r.diastolic, unit: "mmHg", ref: r.ref },
      ],
      metrics: ["bp"],
      n: 1,
    };
  }
  const rows = inRange(ctx.bp, s.from, s.to);
  if (rows.length === 0) return noData("bp", s, ctx);
  const lbl = spanLabel(s);
  if (s.from === s.to) {
    const lines = rows.map((r) => ({
      hi: `${r.time} — ${r.systolic}/${r.diastolic} mmHg (${classifyBP(r.systolic, r.diastolic, th).labelHi})`,
      en: `${r.time} — ${r.systolic}/${r.diastolic} mmHg (${classifyBP(r.systolic, r.diastolic, th).labelEn})`,
    }));
    return {
      hi: `${lbl.hi} के BP: ${lines.map((l) => l.hi).join("; ")}।`,
      en: `BP on ${lbl.en}: ${lines.map((l) => l.en).join("; ")}.`,
      kp: rows.map((r) => ({ text: `${r.time}: ${r.systolic}/${r.diastolic}`, fact_refs: [r.ref] })),
      nums: rows.slice(0, 4).flatMap((r) => [
        { label: `${r.time} सिस्टोलिक`, value: r.systolic, unit: "mmHg", ref: r.ref },
        { label: `${r.time} डायस्टोलिक`, value: r.diastolic, unit: "mmHg", ref: r.ref },
      ]),
      metrics: ["bp"],
      n: rows.length,
    };
  }
  const st = bpStats(ctx.bp, s.from, s.to, th);
  const wk = windowKey(ctx, s);
  const trendHi =
    st.trendSysPerWeek === null
      ? ""
      : Math.abs(st.trendSysPerWeek) < 1
        ? " सिस्टोलिक का रुझान लगभग स्थिर है।"
        : ` सिस्टोलिक का रुझान ${st.trendSysPerWeek > 0 ? "बढ़ता" : "घटता"} हुआ: लगभग ${Math.abs(st.trendSysPerWeek)} mmHg प्रति हफ़्ता।`;
  const trendEn =
    st.trendSysPerWeek === null
      ? ""
      : Math.abs(st.trendSysPerWeek) < 1
        ? " The systolic trend is roughly flat."
        : ` Systolic is trending ${st.trendSysPerWeek > 0 ? "up" : "down"} by about ${Math.abs(st.trendSysPerWeek)} mmHg per week.`;
  const split =
    st.morning.n > 0 && st.evening.n > 0
      ? { hi: ` सुबह का औसत ${st.morning.meanSys}/${st.morning.meanDia} (${st.morning.n} रीडिंग), शाम का ${st.evening.meanSys}/${st.evening.meanDia} (${st.evening.n} रीडिंग)।`, en: ` Morning mean ${st.morning.meanSys}/${st.morning.meanDia} (${st.morning.n} readings), evening ${st.evening.meanSys}/${st.evening.meanDia} (${st.evening.n} readings).` }
      : { hi: "", en: "" };
  const ids = wk ? factRefs(ledger, [`bp.${wk}.mean_sys`, `bp.${wk}.pct_above_target`, `bp.${wk}.n`]) : [];
  const refs = ids.length ? ids : [st.refs[st.refs.length - 1], st.highest?.ref ?? "", st.lowest?.ref ?? ""].filter(Boolean);
  return {
    hi: `${lbl.hi} में ${st.n} BP रीडिंग (${st.daysWithReadings} दिन) दर्ज हैं। औसत ${st.meanSys}/${st.meanDia} mmHg; सबसे ऊँची ${st.highest!.systolic}/${st.highest!.diastolic} (${formatDateHi(st.highest!.date)}), सबसे कम ${st.lowest!.systolic}/${st.lowest!.diastolic} (${formatDateHi(st.lowest!.date)})। ` +
      `${st.n} में से ${st.nAboveTarget} रीडिंग (${st.pctAboveTarget}%) लक्ष्य ${th.target_systolic}/${th.target_diastolic} या उससे ऊपर थीं` +
      (st.nAlert > 0 ? `, ${st.nAlert} अलर्ट रेंज में` : "") +
      (st.nCrisis > 0 ? `, ${st.nCrisis} क्राइसिस रेंज में` : "") +
      `।${split.hi}${trendHi}`,
    en: `${st.n} BP readings (${st.daysWithReadings} days) are logged for ${lbl.en}. Mean ${st.meanSys}/${st.meanDia} mmHg; highest ${st.highest!.systolic}/${st.highest!.diastolic} (${formatDateEn(st.highest!.date)}), lowest ${st.lowest!.systolic}/${st.lowest!.diastolic} (${formatDateEn(st.lowest!.date)}). ` +
      `${st.nAboveTarget} of ${st.n} readings (${st.pctAboveTarget}%) were at or above the ${th.target_systolic}/${th.target_diastolic} target` +
      (st.nAlert > 0 ? `, ${st.nAlert} in the alert range` : "") +
      (st.nCrisis > 0 ? `, ${st.nCrisis} in the crisis range` : "") +
      `.${split.en}${trendEn}`,
    kp: [{ text: `औसत BP ${st.meanSys}/${st.meanDia} (${st.n} रीडिंग)`, fact_refs: refs }],
    nums: [
      { label: "औसत सिस्टोलिक", value: st.meanSys!, unit: "mmHg", ref: refs[0] },
      { label: "औसत डायस्टोलिक", value: st.meanDia!, unit: "mmHg", ref: refs[0] },
      { label: "लक्ष्य से ऊपर रीडिंग", value: st.pctAboveTarget ?? 0, unit: "%", ref: refs[0] },
    ],
    metrics: ["bp"],
    n: st.n,
  };
}

function weightSection(ctx: PatientContext, ledger: Ledger, s: { from: string; to: string } | null, mode: Mode): Section {
  const tgt = ctx.profile.targetWeightKg;
  const last = ctx.weight[ctx.weight.length - 1];
  if (!last) return noData("weight", s ?? { from: ctx.range.from, to: ctx.today }, ctx);
  if (!s || mode === "latest" || mode === "goal") {
    const toT = tgt !== null ? round(last.kg - tgt, 1) : null;
    const bmi = ledger.byId["weight.bmi"];
    return {
      hi: `आख़िरी दर्ज वज़न ${last.kg} किग्रा (${formatDateHi(last.date)}) है।` + (toT === null ? " लक्ष्य वज़न सेट नहीं है।" : toT > 0 ? ` लक्ष्य ${tgt} किग्रा से ${toT} किग्रा ज़्यादा।` : toT < 0 ? ` लक्ष्य ${tgt} किग्रा से ${Math.abs(toT)} किग्रा कम।` : ` यह लक्ष्य ${tgt} किग्रा पर है।`) + (bmi ? ` BMI ${bmi.value} (${bmi.note}).` : ""),
      en: `The latest logged weight is ${last.kg} kg (${formatDateEn(last.date)}).` + (toT === null ? " No target weight is set." : toT > 0 ? ` That is ${toT} kg above the ${tgt} kg target.` : toT < 0 ? ` That is ${Math.abs(toT)} kg below the ${tgt} kg target.` : ` That is at the ${tgt} kg target.`) + (bmi ? ` BMI ${bmi.value} (${bmi.note}).` : ""),
      kp: [{ text: `आख़िरी वज़न ${last.kg} किग्रा`, fact_refs: [last.ref, ...factRefs(ledger, ["weight.to_target", "weight.bmi"])] }],
      nums: [{ label: "आख़िरी वज़न", value: last.kg, unit: "kg", ref: last.ref }, ...(toT !== null && ledger.byId["weight.to_target"] ? [{ label: "लक्ष्य से अंतर", value: Math.abs(toT), unit: "kg", ref: "weight.to_target" }] : [])],
      metrics: ["weight"],
      n: 1,
    };
  }
  const st = weightStats(ctx.weight, s.from, s.to);
  if (st.n === 0) return noData("weight", s, ctx);
  const lbl = spanLabel(s);
  if (s.from === s.to) {
    const r = ctx.weight.filter((w) => w.date === s.from);
    return { hi: `${lbl.hi} का वज़न: ${r.map((x) => `${x.kg} किग्रा (${x.time})`).join(", ")}।`, en: `Weight on ${lbl.en}: ${r.map((x) => `${x.kg} kg (${x.time})`).join(", ")}.`, kp: r.map((x) => ({ text: `${x.kg} किग्रा`, fact_refs: [x.ref] })), nums: r.slice(0, 3).map((x) => ({ label: `वज़न ${x.time}`, value: x.kg, unit: "kg", ref: x.ref })), metrics: ["weight"], n: r.length };
  }
  const stable = st.changeKg !== null && Math.abs(st.changeKg) < WEIGHT_STABLE_KG;
  return {
    hi: `${lbl.hi} में ${st.n} वज़न एंट्री हैं। पहली ${st.first!.kg} किग्रा (${formatDateHi(st.first!.date)}), आख़िरी ${st.last!.kg} किग्रा (${formatDateHi(st.last!.date)}); औसत ${st.meanKg} किग्रा।` + (st.changeKg !== null ? ` बदलाव ${st.changeKg > 0 ? "+" : ""}${st.changeKg} किग्रा${stable ? " (लगभग स्थिर)" : ""}।` : " बदलाव निकालने के लिए कम से कम 2 एंट्री चाहिए।"),
    en: `${st.n} weight entries for ${lbl.en}. First ${st.first!.kg} kg (${formatDateEn(st.first!.date)}), last ${st.last!.kg} kg (${formatDateEn(st.last!.date)}); mean ${st.meanKg} kg.` + (st.changeKg !== null ? ` Change ${st.changeKg > 0 ? "+" : ""}${st.changeKg} kg${stable ? " (roughly stable)" : ""}.` : " At least 2 entries are needed for a change."),
    kp: [{ text: `वज़न ${st.first!.kg} → ${st.last!.kg} किग्रा`, fact_refs: [st.first!.ref, st.last!.ref] }],
    nums: [
      { label: "आख़िरी वज़न", value: st.last!.kg, unit: "kg", ref: st.last!.ref },
      ...(st.changeKg !== null ? [{ label: "बदलाव", value: st.changeKg, unit: "kg", ref: st.last!.ref }] : []),
    ],
    metrics: ["weight"],
    n: st.n,
  };
}

function foodSection(ctx: PatientContext, ledger: Ledger, s: { from: string; to: string } | null, mealKey: string | null): Section {
  const span = s ?? { from: ctx.today, to: ctx.today };
  const lbl = spanLabel(span);
  const rows = inRange(ctx.food, span.from, span.to).filter((r) => !mealKey || r.meal.toLowerCase() === mealKey);
  const mealName = mealKey ? MEAL_WORDS.find((m) => m.key === mealKey)! : null;
  if (rows.length === 0) {
    const base = noData("food", span, ctx);
    return mealName ? { ...base, hi: `${lbl.hi} को ${mealName.hi} का कोई खाना दर्ज नहीं है।`, en: `No ${mealName.en} is logged for ${lbl.en}.` } : base;
  }
  if (span.from === span.to) {
    const byMeal = new Map<string, typeof rows>();
    for (const r of rows) byMeal.set(r.meal, [...(byMeal.get(r.meal) ?? []), r]);
    const partsHi: string[] = [];
    const partsEn: string[] = [];
    for (const [meal, items] of byMeal) {
      const cal = Math.round(items.reduce((a, b) => a + b.calories, 0));
      partsHi.push(`${meal}: ${items.map((i) => `${i.name} (${i.quantity} ${i.unit}, ${Math.round(i.calories)} kcal)`).join(", ")} — कुल ${cal} kcal`);
      partsEn.push(`${meal}: ${items.map((i) => `${i.name} (${i.quantity} ${i.unit}, ${Math.round(i.calories)} kcal)`).join(", ")}; total ${cal} kcal`);
    }
    const total = Math.round(rows.reduce((a, b) => a + b.calories, 0));
    const target = ctx.goals.calorieTarget;
    return {
      hi: `${lbl.hi} को खाने में: ${partsHi.join("। ")}। दिन के कुल ${total} kcal (लक्ष्य ${target} kcal)।`,
      en: `Food on ${lbl.en}: ${partsEn.join(". ")}. Day total ${total} kcal (target ${target} kcal).`,
      kp: rows.slice(0, 8).map((r) => ({ text: `${r.meal}: ${r.name} ${Math.round(r.calories)} kcal`, fact_refs: [r.ref] })),
      nums: [{ label: "कुल कैलोरी", value: total, unit: "kcal", ref: rows[0].ref }, { label: "कैलोरी लक्ष्य", value: target, unit: "kcal", ref: "goal.calorie_target" }],
      metrics: ["food"],
      n: rows.length,
    };
  }
  const st = nutritionStats(ctx.food, span.from, span.to, ctx.goals.calorieTarget);
  const wk = windowKey(ctx, span);
  const refs = wk ? factRefs(ledger, [`food.${wk}.mean_calories`, `food.${wk}.days_logged`]) : rows.slice(-3).map((r) => r.ref);
  const sod = st.meanSodium !== null ? { hi: ` औसत सोडियम ${st.meanSodium} mg/दिन (सिर्फ़ उन एंट्री से जिनमें सोडियम डेटा है; ${st.sodiumCoveragePct}%)।`, en: ` Mean sodium ${st.meanSodium} mg/day (only items with sodium data; ${st.sodiumCoveragePct}%).` } : { hi: "", en: "" };
  return {
    hi: `${lbl.hi} में ${st.daysLogged} दिन खाना दर्ज है (${st.windowDays} में से)। दर्ज दिनों का औसत ${st.meanCalories} kcal/दिन (लक्ष्य ${st.calorieTarget} का ${st.pctOfTarget}%); प्रोटीन ${st.meanProtein} g, कार्ब्स ${st.meanCarbs} g, फैट ${st.meanFat} g, फाइबर ${st.meanFibre} g।${sod.hi} ${st.daysAboveTarget} दिन कैलोरी लक्ष्य से ऊपर रहे।`,
    en: `Food is logged on ${st.daysLogged} of ${st.windowDays} days in ${lbl.en}. Mean over logged days ${st.meanCalories} kcal/day (${st.pctOfTarget}% of the ${st.calorieTarget} target); protein ${st.meanProtein} g, carbs ${st.meanCarbs} g, fat ${st.meanFat} g, fibre ${st.meanFibre} g.${sod.en} Calories exceeded the target on ${st.daysAboveTarget} days.`,
    kp: [{ text: `औसत ${st.meanCalories} kcal/दिन (${st.daysLogged} दिन)`, fact_refs: refs }],
    nums: [{ label: "औसत कैलोरी", value: st.meanCalories ?? 0, unit: "kcal/day", ref: refs[0] ?? "goal.calorie_target" }],
    metrics: ["food"],
    n: st.items,
  };
}

function sleepSection(ctx: PatientContext, ledger: Ledger, s: { from: string; to: string } | null): Section {
  const span = s ?? { from: addDaysIST(ctx.today, -6), to: ctx.today };
  const lbl = spanLabel(span);
  const st = sleepStats(ctx.sleep, span.from, span.to, ctx.goals.sleepTargetHours);
  if (st.n === 0) return noData("sleep", span, ctx);
  const rows = inRange(ctx.sleep, span.from, span.to);
  if (span.from === span.to) {
    const r = rows[0];
    return { hi: `${lbl.hi} की नींद: ${r.hours} घंटे (लक्ष्य ${st.targetHours} घंटे)।`, en: `Sleep for ${lbl.en}: ${r.hours} hours (target ${st.targetHours}).`, kp: [{ text: `नींद ${r.hours} घंटे`, fact_refs: [r.ref] }], nums: [{ label: "नींद", value: r.hours, unit: "hours", ref: r.ref }], metrics: ["sleep"], n: 1 };
  }
  const wk = windowKey(ctx, span);
  const refs = wk ? factRefs(ledger, [`sleep.${wk}.mean`, `sleep.${wk}.n`]) : rows.slice(-3).map((r) => r.ref);
  return {
    hi: `${lbl.hi} में ${st.n} रातों का औसत ${st.meanHours} घंटे (सबसे कम ${st.minHours}, सबसे ज़्यादा ${st.maxHours}); लक्ष्य ${st.targetHours} घंटे से ${st.vsTargetHours! < 0 ? `${Math.abs(st.vsTargetHours!)} घंटे कम` : `${st.vsTargetHours} घंटे ज़्यादा`}। ${SLEEP_SHORT_HOURS} घंटे से कम की ${st.nShort} रातें।`,
    en: `Over ${lbl.en}, ${st.n} nights average ${st.meanHours} hours (shortest ${st.minHours}, longest ${st.maxHours}); ${st.vsTargetHours! < 0 ? `${Math.abs(st.vsTargetHours!)} h under` : `${st.vsTargetHours} h over`} the ${st.targetHours} h target. ${st.nShort} nights were under ${SLEEP_SHORT_HOURS} hours.`,
    kp: [{ text: `औसत नींद ${st.meanHours} घंटे (${st.n} रातें)`, fact_refs: refs }],
    nums: [{ label: "औसत नींद", value: st.meanHours!, unit: "hours", ref: refs[0] }],
    metrics: ["sleep"],
    n: st.n,
  };
}

function stepsSection(ctx: PatientContext, ledger: Ledger, s: { from: string; to: string } | null): Section {
  const span = s ?? { from: addDaysIST(ctx.today, -6), to: ctx.today };
  const lbl = spanLabel(span);
  const st = activityStats(ctx.activity, span.from, span.to, ctx.goals.stepGoal);
  if (st.n === 0) return noData("steps", span, ctx);
  const rows = inRange(ctx.activity, span.from, span.to);
  if (span.from === span.to) {
    const r = rows[0];
    return { hi: `${lbl.hi} को ${r.steps} कदम (${r.distance_km} किमी, ${r.walking_minutes} मिनट); लक्ष्य ${st.goal} कदम।`, en: `${r.steps} steps on ${lbl.en} (${r.distance_km} km, ${r.walking_minutes} min); goal ${st.goal}.`, kp: [{ text: `${r.steps} कदम`, fact_refs: [r.ref] }], nums: [{ label: "कदम", value: r.steps, unit: "steps", ref: r.ref }], metrics: ["steps"], n: 1 };
  }
  const wk = windowKey(ctx, span);
  const refs = wk ? factRefs(ledger, [`steps.${wk}.mean`, `steps.${wk}.n`]) : rows.slice(-3).map((r) => r.ref);
  return {
    hi: `${lbl.hi} में ${st.n} दिन के कदम दर्ज हैं: औसत ${st.meanSteps} कदम/दिन (लक्ष्य ${st.goal} का ${st.pctOfGoal}%), सबसे ज़्यादा ${st.best!.steps} (${formatDateHi(st.best!.date)})। ${st.nMetGoal} दिन लक्ष्य पूरा हुआ। कुल ${st.totalSteps} कदम, ${st.totalDistanceKm} किमी।`,
    en: `${st.n} days of steps in ${lbl.en}: mean ${st.meanSteps} steps/day (${st.pctOfGoal}% of the ${st.goal} goal), best ${st.best!.steps} (${formatDateEn(st.best!.date)}). Goal met on ${st.nMetGoal} days. Total ${st.totalSteps} steps, ${st.totalDistanceKm} km.`,
    kp: [{ text: `औसत ${st.meanSteps} कदम/दिन`, fact_refs: refs }],
    nums: [{ label: "औसत कदम", value: st.meanSteps!, unit: "steps", ref: refs[0] }],
    metrics: ["steps"],
    n: st.n,
  };
}

function medicineSection(ctx: PatientContext, ledger: Ledger, s: { from: string; to: string } | null, only: MedicineInfo[] = []): Section {
  const span = s ?? { from: addDaysIST(ctx.today, -6), to: ctx.today };
  const lbl = spanLabel(span);
  // When the question names a medicine ("amlodipine li kya?"), answer for THAT medicine only.
  const ids = new Set(only.map((m) => m.id));
  const doses = ids.size ? ctx.doses.filter((x) => ids.has(x.medicineId)) : ctx.doses;
  const who = ids.size ? only.map((m) => `${m.name} ${m.dose}`).join(", ") : "";
  const st = adherenceStats(doses, span.from, span.to);
  const rows = inRange(doses, span.from, span.to);
  if (rows.length === 0) {
    return { hi: ctx.medicines.length === 0 ? "इस मरीज़ की कोई दवा ऐप में दर्ज नहीं है।" : `${who ? `${who}: ` : ""}${lbl.hi} के लिए दवा की कोई खुराक देय नहीं थी।`, en: ctx.medicines.length === 0 ? "No medicines are recorded for this patient." : `${who ? `${who}: ` : ""}No doses were due in ${lbl.en}.`, kp: [], nums: [], metrics: ["medicine"], n: 0 };
  }
  const statusHi = { taken: "समय पर ली", late: "देर से ली", missed: "छूट गई", pending: "बाकी है" } as const;
  const statusEn = { taken: "taken", late: "taken late", missed: "missed", pending: "still pending" } as const;
  if (span.from === span.to) {
    return {
      hi: `${lbl.hi} की दवाएँ: ${rows.map((r) => `${r.medicineName} ${r.dose} (${r.scheduled}) — ${statusHi[r.status]}`).join("; ")}।`,
      en: `Medicines on ${lbl.en}: ${rows.map((r) => `${r.medicineName} ${r.dose} (${r.scheduled}): ${statusEn[r.status]}`).join("; ")}.`,
      kp: rows.map((r) => ({ text: `${r.medicineName} ${r.scheduled}: ${statusEn[r.status]}`, fact_refs: [r.ref] })),
      nums: [{ label: "छूटी खुराकें", value: st.missed, unit: "doses", ref: rows[0].ref }],
      metrics: ["medicine"],
      n: rows.length,
    };
  }
  const wk = windowKey(ctx, span);
  // The ledger's adherence facts cover ALL medicines, so they back the numbers only when the question did not name one.
  const factIds = wk && !ids.size ? factRefs(ledger, [`meds.${wk}.adherence_pct`, `meds.${wk}.due`]) : [];
  const refs = factIds.length ? factIds : rows.slice(-3).map((r) => r.ref);
  const worst = st.perMedicine.filter((m) => m.due > 0).sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100))[0];
  const partNames = { morning: ["सुबह", "morning"], afternoon: ["दोपहर", "afternoon"], evening: ["शाम", "evening"], night: ["रात", "night"] } as const;
  const parts = (Object.keys(st.perPart) as Array<keyof typeof st.perPart>).filter((k) => st.perPart[k].due > 0);
  return {
    hi: st.due === 0 ? `${lbl.hi} में कोई खुराक अभी तक देय नहीं हुई।` : `${who ? `${who}, ` : ""}${lbl.hi} में ${st.due} खुराकें देय थीं: ${st.taken} समय पर, ${st.late} देर से (${MEDICINE_LATE_AFTER_MIN} मिनट से ज़्यादा), ${st.missed} छूटीं। दवा पालन ${st.pct}%।` + (worst && worst.pct !== null && worst.pct < 100 ? ` सबसे कम पालन: ${worst.name} (${worst.pct}%)।` : "") + (parts.length ? ` समय के हिसाब से: ${parts.map((k) => `${partNames[k][0]} ${st.perPart[k].pct}%`).join(", ")}।` : "") + (st.missedDates.length ? ` छूटी हुई तारीख़ें: ${st.missedDates.slice(-6).map(formatDateHi).join(", ")}।` : ""),
    en: st.due === 0 ? `No doses were due yet in ${lbl.en}.` : `${who ? `${who}: ` : ""}${st.due} doses were due in ${lbl.en}: ${st.taken} on time, ${st.late} late (over ${MEDICINE_LATE_AFTER_MIN} min), ${st.missed} missed. Adherence ${st.pct}%.` + (worst && worst.pct !== null && worst.pct < 100 ? ` Lowest: ${worst.name} (${worst.pct}%).` : "") + (parts.length ? ` By time of day: ${parts.map((k) => `${partNames[k][1]} ${st.perPart[k].pct}%`).join(", ")}.` : "") + (st.missedDates.length ? ` Days with a missed dose: ${st.missedDates.slice(-6).map(formatDateEn).join(", ")}.` : ""),
    kp: [{ text: `दवा पालन ${st.pct}% (${st.due} देय)`, fact_refs: refs }],
    nums: st.due > 0 ? [{ label: "दवा पालन", value: st.pct ?? 0, unit: "%", ref: refs[0] }, { label: "छूटी खुराकें", value: st.missed, unit: "doses", ref: refs[0] }] : [],
    metrics: ["medicine"],
    n: st.due,
  };
}

// ---------------------------------------------------------------------------
// Compare / goal / missing / summary
// ---------------------------------------------------------------------------

interface Period {
  from: string;
  to: string;
}

function metricMean(ctx: PatientContext, m: Metric, p: Period): { value: number | null; n: number; unit: string; label: Bi; ref: string } {
  switch (m) {
    case "bp": {
      const st = bpStats(ctx.bp, p.from, p.to, ctx.goals.bp);
      return { value: st.meanSys, n: st.n, unit: "mmHg", label: { hi: "औसत सिस्टोलिक BP", en: "mean systolic BP" }, ref: st.refs[st.refs.length - 1] ?? "" };
    }
    case "weight": {
      const st = weightStats(ctx.weight, p.from, p.to);
      return { value: st.meanKg, n: st.n, unit: "kg", label: { hi: "औसत वज़न", en: "mean weight" }, ref: st.last?.ref ?? "" };
    }
    case "food": {
      const st = nutritionStats(ctx.food, p.from, p.to, ctx.goals.calorieTarget);
      return { value: st.meanCalories, n: st.daysLogged, unit: "kcal/day", label: { hi: "औसत कैलोरी", en: "mean calories" }, ref: st.refs[st.refs.length - 1] ?? "" };
    }
    case "sleep": {
      const st = sleepStats(ctx.sleep, p.from, p.to, ctx.goals.sleepTargetHours);
      return { value: st.meanHours, n: st.n, unit: "hours", label: { hi: "औसत नींद", en: "mean sleep" }, ref: st.refs[st.refs.length - 1] ?? "" };
    }
    case "steps": {
      const st = activityStats(ctx.activity, p.from, p.to, ctx.goals.stepGoal);
      return { value: st.meanSteps, n: st.n, unit: "steps/day", label: { hi: "औसत कदम", en: "mean steps" }, ref: st.refs[st.refs.length - 1] ?? "" };
    }
    default: {
      const st = adherenceStats(ctx.doses, p.from, p.to);
      return { value: st.pct, n: st.due, unit: "%", label: { hi: "दवा पालन", en: "medicine adherence" }, ref: st.refs[st.refs.length - 1] ?? "" };
    }
  }
}

function compareSection(ctx: PatientContext, metrics: Metric[], a: Period, b: Period): Section {
  const la = spanLabel(a);
  const lb = spanLabel(b);
  const hi: string[] = [];
  const en: string[] = [];
  const kp: KeyPoint[] = [];
  const nums: AnswerNumber[] = [];
  let n = 0;
  for (const m of metrics) {
    const A = metricMean(ctx, m === "pulse" ? "bp" : m, a);
    const B = metricMean(ctx, m === "pulse" ? "bp" : m, b);
    n += A.n + B.n;
    if (A.value === null || B.value === null) {
      hi.push(`${A.label.hi}: तुलना के लिए दोनों अवधि में डेटा चाहिए (${la.hi}: ${A.n}, ${lb.hi}: ${B.n} एंट्री)`);
      en.push(`${A.label.en}: both periods need data (${la.en}: ${A.n}, ${lb.en}: ${B.n} entries)`);
      continue;
    }
    const diff = round(A.value - B.value, 1);
    const word = diff === 0 ? { hi: "कोई बदलाव नहीं", en: "no change" } : diff > 0 ? { hi: `${diff} ज़्यादा`, en: `${diff} higher` } : { hi: `${Math.abs(diff)} कम`, en: `${Math.abs(diff)} lower` };
    hi.push(`${A.label.hi}: ${A.value} ${A.unit} (${la.hi}) बनाम ${B.value} ${A.unit} (${lb.hi}) — ${word.hi} (${A.n} बनाम ${B.n} एंट्री)`);
    en.push(`${A.label.en}: ${A.value} ${A.unit} (${la.en}) vs ${B.value} ${A.unit} (${lb.en}): ${word.en} (${A.n} vs ${B.n} entries)`);
    kp.push({ text: `${A.label.hi}: ${A.value} बनाम ${B.value}`, fact_refs: [A.ref, B.ref].filter(Boolean) });
    nums.push({ label: `${A.label.hi} (${la.hi})`, value: A.value, unit: A.unit, ref: A.ref || B.ref }, { label: `${B.label.hi} (${lb.hi})`, value: B.value, unit: B.unit, ref: B.ref || A.ref }, { label: `${A.label.hi}: अंतर`, value: diff, unit: A.unit, ref: A.ref || B.ref });
  }
  return { hi: hi.join("।\n") + "।", en: en.join(".\n") + ".", kp, nums: nums.filter((x) => x.ref), metrics, n };
}

function goalSection(ctx: PatientContext, ledger: Ledger, metrics: Metric[]): Section {
  const parts: Section[] = [];
  const want = metrics.length ? metrics : (["weight", "steps", "food", "sleep"] as Metric[]);
  for (const m of want) {
    if (m === "weight") parts.push(weightSection(ctx, ledger, null, "goal"));
    if (m === "steps") {
      const st = activityStats(ctx.activity, addDaysIST(ctx.today, -6), ctx.today, ctx.goals.stepGoal);
      parts.push(
        st.n === 0
          ? noData("steps", { from: addDaysIST(ctx.today, -6), to: ctx.today }, ctx)
          : { hi: `पिछले 7 दिन का औसत ${st.meanSteps} कदम/दिन है; लक्ष्य ${st.goal} से ${Math.max(0, st.goal - (st.meanSteps ?? 0))} कदम कम।`, en: `The 7-day mean is ${st.meanSteps} steps/day; ${Math.max(0, st.goal - (st.meanSteps ?? 0))} short of the ${st.goal} goal.`, kp: [{ text: `औसत ${st.meanSteps} बनाम लक्ष्य ${st.goal}`, fact_refs: factRefs(ledger, ["steps.7d.mean", "goal.step_goal"]) }], nums: [{ label: "औसत कदम", value: st.meanSteps!, unit: "steps", ref: "steps.7d.mean" }, { label: "कदम लक्ष्य", value: st.goal, unit: "steps", ref: "goal.step_goal" }], metrics: ["steps"], n: st.n },
      );
    }
    if (m === "food") {
      const st = nutritionStats(ctx.food, addDaysIST(ctx.today, -6), ctx.today, ctx.goals.calorieTarget);
      parts.push(
        st.daysLogged === 0
          ? noData("food", { from: addDaysIST(ctx.today, -6), to: ctx.today }, ctx)
          : { hi: `पिछले 7 दिन में दर्ज दिनों का औसत ${st.meanCalories} kcal/दिन है; लक्ष्य ${st.calorieTarget} kcal (${st.pctOfTarget}%)।`, en: `Over the last 7 days the mean on logged days is ${st.meanCalories} kcal/day vs the ${st.calorieTarget} kcal target (${st.pctOfTarget}%).`, kp: [{ text: `औसत ${st.meanCalories} बनाम लक्ष्य ${st.calorieTarget}`, fact_refs: factRefs(ledger, ["food.7d.mean_calories", "goal.calorie_target"]) }], nums: [{ label: "औसत कैलोरी", value: st.meanCalories!, unit: "kcal", ref: "food.7d.mean_calories" }, { label: "कैलोरी लक्ष्य", value: st.calorieTarget, unit: "kcal", ref: "goal.calorie_target" }], metrics: ["food"], n: st.items },
      );
    }
    if (m === "sleep") parts.push(sleepSection(ctx, ledger, null));
    if (m === "bp") {
      const th = ctx.goals.bp;
      const st = bpStats(ctx.bp, addDaysIST(ctx.today, -6), ctx.today, th);
      parts.push(st.n === 0 ? noData("bp", { from: addDaysIST(ctx.today, -6), to: ctx.today }, ctx) : { hi: `पिछले 7 दिन का औसत BP ${st.meanSys}/${st.meanDia} है; लक्ष्य ${th.target_systolic}/${th.target_diastolic} से कम रहना है। ${st.pctAboveTarget}% रीडिंग लक्ष्य या उससे ऊपर थीं।`, en: `The 7-day mean BP is ${st.meanSys}/${st.meanDia}; the target is below ${th.target_systolic}/${th.target_diastolic}. ${st.pctAboveTarget}% of readings were at or above target.`, kp: [{ text: `औसत ${st.meanSys}/${st.meanDia}`, fact_refs: factRefs(ledger, ["bp.7d.mean_sys", "goal.bp_target_sys"]) }], nums: [{ label: "औसत सिस्टोलिक", value: st.meanSys!, unit: "mmHg", ref: "bp.7d.mean_sys" }, { label: "लक्ष्य सिस्टोलिक", value: th.target_systolic, unit: "mmHg", ref: "goal.bp_target_sys" }], metrics: ["bp"], n: st.n });
    }
  }
  return mergeSections(parts);
}

function missingSection(ctx: PatientContext, span: Period): Section {
  const days: string[] = [];
  for (let x = span.from; x <= span.to; x = addDaysIST(x, 1)) days.push(x);
  const has = (m: Metric): Set<string> =>
    new Set(
      m === "bp" ? ctx.bp.map((r) => r.date) : m === "food" ? ctx.food.map((r) => r.date) : m === "sleep" ? ctx.sleep.map((r) => r.date) : m === "steps" ? ctx.activity.map((r) => r.date) : m === "weight" ? ctx.weight.map((r) => r.date) : [],
    );
  const hi: string[] = [];
  const en: string[] = [];
  const lbl = spanLabel(span);
  for (const m of ["bp", "food", "sleep", "steps", "weight"] as Metric[]) {
    const have = has(m);
    const missing = days.filter((x) => !have.has(x) && x <= ctx.today);
    // Today is only "missing" once the day is over.
    const shown = missing.filter((x) => x !== ctx.today);
    hi.push(`${METRIC_NAME[m].hi}: ${shown.length === 0 ? "हर दिन दर्ज है" : `${shown.length} दिन दर्ज नहीं (${shown.slice(-6).map(formatDateHi).join(", ")})`}`);
    en.push(`${METRIC_NAME[m].en}: ${shown.length === 0 ? "logged every day" : `${shown.length} days not logged (${shown.slice(-6).map(formatDateEn).join(", ")})`}`);
  }
  const ad = adherenceStats(ctx.doses, span.from, span.to);
  hi.push(`दवा: ${ad.missed} खुराक छूटी`);
  en.push(`Medicines: ${ad.missed} doses missed`);
  return { hi: `${lbl.hi} में क्या दर्ज नहीं हुआ:\n${hi.join("\n")}`, en: `What is missing for ${lbl.en}:\n${en.join("\n")}`, kp: [], nums: [{ label: "छूटी खुराकें", value: ad.missed, unit: "doses", ref: ad.refs[ad.refs.length - 1] ?? "" }].filter((x) => x.ref), metrics: ["bp", "food", "sleep", "steps", "weight", "medicine"], n: days.length };
}

function mergeSections(parts: Section[]): Section {
  return {
    hi: parts.map((p) => p.hi).join("\n"),
    en: parts.map((p) => p.en).join("\n"),
    kp: parts.flatMap((p) => p.kp),
    nums: parts.flatMap((p) => p.nums),
    metrics: Array.from(new Set(parts.flatMap((p) => p.metrics))),
    n: parts.reduce((a, p) => a + p.n, 0),
  };
}

function summarySection(ctx: PatientContext, ledger: Ledger, span: Period): Section {
  const single = span.from === span.to;
  const bits: Section[] = [bpSection(ctx, ledger, span, "value"), medicineSection(ctx, ledger, span), foodSection(ctx, ledger, span, null)];
  if (single) {
    const sl = ctx.sleep[ctx.sleep.length - 1];
    if (sl) bits.push({ hi: `आख़िरी नींद एंट्री (${formatDateHi(sl.date)}): ${sl.hours} घंटे।`, en: `Latest sleep entry (${formatDateEn(sl.date)}): ${sl.hours} hours.`, kp: [{ text: `नींद ${sl.hours} घंटे`, fact_refs: [sl.ref] }], nums: [{ label: "नींद", value: sl.hours, unit: "hours", ref: sl.ref }], metrics: ["sleep"], n: 1 });
    const ac = inRange(ctx.activity, span.from, span.to)[0];
    bits.push(ac ? stepsSection(ctx, ledger, span) : { hi: "आज के कदम अभी दर्ज नहीं हुए।", en: "Today's steps are not logged yet.", kp: [], nums: [], metrics: ["steps"], n: 0 });
    const w = ctx.weight[ctx.weight.length - 1];
    if (w) bits.push({ hi: `आख़िरी वज़न ${w.kg} किग्रा (${formatDateHi(w.date)})।`, en: `Latest weight ${w.kg} kg (${formatDateEn(w.date)}).`, kp: [{ text: `वज़न ${w.kg} किग्रा`, fact_refs: [w.ref] }], nums: [{ label: "वज़न", value: w.kg, unit: "kg", ref: w.ref }], metrics: ["weight"], n: 1 });
  } else {
    bits.push(weightSection(ctx, ledger, span, "value"), sleepSection(ctx, ledger, span), stepsSection(ctx, ledger, span));
  }
  return mergeSections(bits);
}

// ---------------------------------------------------------------------------
// Scope-aware sections: small talk, untracked topics, typed readings, schedule, extremes
// ---------------------------------------------------------------------------

const TRACKED: Bi = { hi: "BP/नब्ज़, वज़न, खाना, नींद, कदम और दवाएँ", en: "BP/pulse, weight, food, sleep, steps and medicines" };

const plain = (hi: string, en: string, metrics: Metric[] = []): Section => ({ hi, en, kp: [], nums: [], metrics, n: 0 });

function smallTalkSection(kind: "greeting" | "thanks"): Section {
  return kind === "greeting"
    ? plain(
        `नमस्ते! मैं SOIE हूँ। मैं मरीज़ के दर्ज ${TRACKED.hi} के बारे में बता सकता हूँ। जैसे: "आज पापा कैसे रहे?", "पिछले 7 दिन का average BP", "कल खाने में क्या था?"`,
        `Hello! I am SOIE. I can tell you about the patient's logged ${TRACKED.en}. For example: "How was Papa today?", "Average BP over the last 7 days", "What did he eat yesterday?"`,
      )
    : plain("आपका स्वागत है। कुछ और पूछना हो तो बताइए।", "You are welcome. Ask me anything else about the logged data.");
}

const joinBi = (xs: Bi[]): Bi => ({ hi: xs.map((x) => x.hi).join(", "), en: xs.map((x) => x.en).join(", ") });

/** The question is about something the app never records: say so, show nothing unrelated, never estimate. */
function untrackedSection(topics: UntrackedTopic[]): Section {
  const names = joinBi(topics);
  return plain(
    `${names.hi} इस ऐप में दर्ज नहीं होता, इसलिए मैं इसका कोई आँकड़ा नहीं बता सकता और अंदाज़ा भी नहीं लगाऊँगा। ऐप में ये दर्ज होता है: ${TRACKED.hi}। ${names.hi} के लिए अपनी जाँच रिपोर्ट देखें या डॉक्टर से पूछें।`,
    `${names.en} is not recorded in this app, so I cannot give a value and I will not guess one. The app records ${TRACKED.en}. For ${names.en}, check the lab report or ask the doctor.`,
  );
}

const untrackedNote = (topics: UntrackedTopic[]): Bi => {
  const names = joinBi(topics);
  return { hi: `(${names.hi} ऐप में दर्ज नहीं होता, इसलिए उसका जवाब नहीं दे रहा।)`, en: `(${names.en} is not recorded in this app, so I am not answering that part.)` };
};

/** The user typed a reading ("mera BP 150/95 hai"): classify THAT reading, never substitute a logged one. */
function typedReadingSection(ctx: PatientContext, readings: Array<{ systolic: number; diastolic: number }>): { sec: Section; needsDoctor: boolean } {
  const th = ctx.goals.bp;
  const items = readings.slice(0, 2).map((r) => ({ r, c: classifyBP(r.systolic, r.diastolic, th) }));
  const hi: string[] = [];
  const en: string[] = [];
  for (const { r, c } of items) {
    hi.push(`आपने BP ${r.systolic}/${r.diastolic} बताया। लक्ष्य (${th.target_systolic}/${th.target_diastolic} से कम) और अलर्ट सीमा के हिसाब से यह "${c.labelHi}" श्रेणी में आता है।`);
    en.push(`You mentioned a BP of ${r.systolic}/${r.diastolic}. Against the target (below ${th.target_systolic}/${th.target_diastolic}) and the alert limits, that is in the "${c.labelEn}" category.`);
  }
  const attention = items.some(({ c }) => c.aboveTarget || c.exceedsAlert || c.needsUrgentAttention || c.category === "low");
  hi.push("यह रीडिंग ऐप में दर्ज नहीं हुई है; दर्ज करने के लिए BP पेज पर जाएँ। एक रीडिंग से नतीजा न निकालें: 5 मिनट आराम से बैठकर दोबारा नापें।" + (attention ? " चक्कर, सीने में दर्द, साँस फूलना, बोलने में दिक्कत या कमज़ोरी हो तो तुरंत 112/108 पर कॉल करें। रीडिंग बार-बार ऊँची आए तो डॉक्टर को दिखाएँ; दवा अपने आप न बदलें।" : ""));
  en.push("This reading is not saved in the app; log it on the BP page. Do not judge by a single reading: sit quietly for 5 minutes and measure again." + (attention ? " If there is dizziness, chest pain, breathlessness, trouble speaking or weakness, call 112/108 at once. If readings stay high, show the doctor; do not change any medicine on your own." : ""));
  const last = ctx.bp[ctx.bp.length - 1];
  const kp: KeyPoint[] = [];
  if (last) {
    hi.push(`तुलना के लिए: ऐप में दर्ज आख़िरी रीडिंग ${last.systolic}/${last.diastolic} (${formatDateHi(last.date)}, ${last.time}) है।`);
    en.push(`For comparison, the latest reading logged in the app is ${last.systolic}/${last.diastolic} (${formatDateEn(last.date)}, ${last.time}).`);
    kp.push({ text: `आख़िरी दर्ज BP ${last.systolic}/${last.diastolic}`, fact_refs: [last.ref] });
  }
  return { sec: { hi: hi.join("\n"), en: en.join("\n"), kp, nums: [], metrics: ["bp"], n: 1 }, needsDoctor: attention };
}

const DOSE_STATUS_HI = { taken: "आज समय पर ली", late: "आज देर से ली", missed: "आज छूट गई", pending: "आज अभी बाकी" } as const;
const DOSE_STATUS_EN = { taken: "taken on time today", late: "taken late today", missed: "missed today", pending: "still due today" } as const;

/** "kaun si dawai", "amlodipine kab leni hai": the plan (what, how much, when), not the adherence record. */
function scheduleSection(ctx: PatientContext, named: MedicineInfo[]): Section {
  if (ctx.medicines.length === 0) return plain("इस मरीज़ की कोई दवा ऐप में दर्ज नहीं है।", "No medicines are recorded for this patient.", ["medicine"]);
  const list = (named.length ? named : ctx.medicines.filter((m) => m.active)).slice().sort((a, b) => a.scheduled.localeCompare(b.scheduled));
  if (list.length === 0) return plain("अभी कोई सक्रिय दवा दर्ज नहीं है।", "There are no active medicines recorded.", ["medicine"]);
  const todays = ctx.doses.filter((x) => x.date === ctx.today);
  const hi: string[] = [];
  const en: string[] = [];
  const kp: KeyPoint[] = [];
  for (const m of list) {
    const meal = mealRelationLabel(m.mealRelation);
    const freq = frequencyLabel(m.frequency);
    const dose = todays.find((x) => x.medicineId === m.id && x.scheduled === m.scheduled) ?? todays.find((x) => x.medicineId === m.id);
    const off = m.active ? "" : " [बंद]";
    const offEn = m.active ? "" : " [inactive]";
    hi.push(`${m.name} ${m.dose} — ${m.scheduled} बजे${meal ? ` (${meal})` : ""}${freq ? `, ${freq}` : ""}${dose ? `; ${DOSE_STATUS_HI[dose.status]}` : ""}${off}`);
    en.push(`${m.name} ${m.dose}: ${m.scheduled}${m.mealRelation ? ` (${m.mealRelation.replace(/_/g, " ")})` : ""}${m.frequency ? `, ${m.frequency}` : ""}${dose ? `; ${DOSE_STATUS_EN[dose.status]}` : ""}${offEn}`);
    kp.push({ text: `${m.name} ${m.dose} ${m.scheduled}`, fact_refs: dose ? [dose.ref] : [] });
  }
  const head = named.length ? { hi: "दर्ज दवा का समय:", en: "Recorded schedule:" } : { hi: `ऐप में ${list.length} सक्रिय दवाएँ दर्ज हैं:`, en: `${list.length} active medicines are recorded:` };
  return { hi: `${head.hi}\n${hi.join("\n")}`, en: `${head.en}\n${en.join("\n")}`, kp, nums: [], metrics: ["medicine"], n: list.length };
}

/** Highest / lowest entry and WHEN it was ("sabse zyada BP kab tha"). */
function extremeSection(ctx: PatientContext, m: Metric, span: Period, want: { high: boolean; low: boolean }, byPulse = false): Section {
  const lbl = spanLabel(span);
  const both = want.high === want.low;
  const wantHigh = both || want.high;
  const wantLow = both || want.low;
  const none = noData(m, span, ctx);
  type Row = { ref: string; date: string; time?: string; v: number };
  const pick = (rows: Row[]): { hi: Row; lo: Row } | null => {
    if (rows.length === 0) return null;
    let hi = rows[0];
    let lo = rows[0];
    for (const r of rows) {
      if (r.v >= hi.v) hi = r;
      if (r.v <= lo.v) lo = r;
    }
    return { hi, lo };
  };
  const when = (r: Row, lang: "hi" | "en") => `${lang === "hi" ? formatDateHi(r.date) : formatDateEn(r.date)}${r.time ? `, ${r.time}` : ""}`;
  const build = (rows: Row[], fmt: (r: Row) => string, nameHi: string, nameEn: string, unit: Bi, hiWord: Bi, loWord: Bi, nm: string): Section => {
    const e = pick(rows);
    if (!e) return none;
    const hiParts: string[] = [];
    const enParts: string[] = [];
    const kp: KeyPoint[] = [];
    const nums: AnswerNumber[] = [];
    if (wantHigh) {
      hiParts.push(`सबसे ${hiWord.hi} ${nameHi} ${fmt(e.hi)} ${unit.hi} (${when(e.hi, "hi")})`);
      enParts.push(`${hiWord.en} ${nameEn}: ${fmt(e.hi)} ${unit.en} (${when(e.hi, "en")})`);
      kp.push({ text: `सबसे ${hiWord.hi} ${nameHi} ${fmt(e.hi)} (${e.hi.date})`, fact_refs: [e.hi.ref] });
      nums.push({ label: `सबसे ${hiWord.hi} ${nameHi}`, value: e.hi.v, unit: nm, ref: e.hi.ref });
    }
    if (wantLow) {
      hiParts.push(`सबसे ${loWord.hi} ${nameHi} ${fmt(e.lo)} ${unit.hi} (${when(e.lo, "hi")})`);
      enParts.push(`${loWord.en} ${nameEn}: ${fmt(e.lo)} ${unit.en} (${when(e.lo, "en")})`);
      kp.push({ text: `सबसे ${loWord.hi} ${nameHi} ${fmt(e.lo)} (${e.lo.date})`, fact_refs: [e.lo.ref] });
      nums.push({ label: `सबसे ${loWord.hi} ${nameHi}`, value: e.lo.v, unit: nm, ref: e.lo.ref });
    }
    return { hi: `${lbl.hi} में ${rows.length} एंट्री में से: ${hiParts.join("; ")}।`, en: `Of ${rows.length} entries in ${lbl.en}: ${enParts.join("; ")}.`, kp, nums, metrics: [m], n: rows.length };
  };
  switch (m) {
    case "bp": {
      if (byPulse) {
        const withPulse = inRange(ctx.bp, span.from, span.to).filter((r) => r.pulse !== null);
        return build(withPulse.map((r) => ({ ref: r.ref, date: r.date, time: r.time, v: r.pulse as number })), (r) => String(r.v), "नब्ज़", "pulse", { hi: "प्रति मिनट", en: "bpm" }, { hi: "तेज़", en: "Fastest" }, { hi: "धीमी", en: "Slowest" }, "bpm");
      }
      const bp = inRange(ctx.bp, span.from, span.to);
      const rows: Row[] = bp.map((r) => ({ ref: r.ref, date: r.date, time: r.time, v: r.systolic }));
      const byRef = new Map(bp.map((r) => [r.ref, r]));
      const sec = build(rows, (r) => `${r.v}/${byRef.get(r.ref)!.diastolic}`, "BP", "BP", { hi: "mmHg", en: "mmHg" }, { hi: "ऊँची", en: "Highest" }, { hi: "कम", en: "Lowest" }, "mmHg");
      return { ...sec, hi: `${sec.hi} (ऊँची/कम सिस्टोलिक BP के हिसाब से)`, en: `${sec.en} (ranked by systolic)` };
    }
    case "weight":
      return build(inRange(ctx.weight, span.from, span.to).map((r) => ({ ref: r.ref, date: r.date, time: r.time, v: r.kg })), (r) => String(r.v), "वज़न", "weight", { hi: "किग्रा", en: "kg" }, { hi: "ज़्यादा", en: "Highest" }, { hi: "कम", en: "Lowest" }, "kg");
    case "steps":
      return build(inRange(ctx.activity, span.from, span.to).map((r) => ({ ref: r.ref, date: r.date, v: r.steps })), (r) => String(r.v), "कदम", "steps", { hi: "कदम", en: "steps" }, { hi: "ज़्यादा", en: "Highest" }, { hi: "कम", en: "Lowest" }, "steps");
    case "sleep":
      return build(inRange(ctx.sleep, span.from, span.to).map((r) => ({ ref: r.ref, date: r.date, v: r.hours })), (r) => String(r.v), "नींद", "sleep", { hi: "घंटे", en: "hours" }, { hi: "ज़्यादा", en: "Longest" }, { hi: "कम", en: "Shortest" }, "hours");
    case "food": {
      const byDay = new Map<string, { cal: number; ref: string }>();
      for (const r of inRange(ctx.food, span.from, span.to)) {
        const cur = byDay.get(r.date);
        byDay.set(r.date, { cal: (cur?.cal ?? 0) + r.calories, ref: cur?.ref ?? r.ref });
      }
      return build(Array.from(byDay, ([date, v]) => ({ ref: v.ref, date, v: Math.round(v.cal) })), (r) => String(r.v), "कैलोरी (पूरा दिन)", "calories (whole day)", { hi: "kcal", en: "kcal" }, { hi: "ज़्यादा", en: "Highest" }, { hi: "कम", en: "Lowest" }, "kcal");
    }
    default:
      return none;
  }
}

/** Notes the family asked SOIE to remember (allergies, preferences). Only these can answer "doodh se allergy hai kya". */
function memorySection(ctx: PatientContext, text: string): Section {
  const toks = contentTokens(text);
  const hits = ctx.memories.filter((m) => {
    const f = fold(m.content);
    return toks.length === 0 || toks.some((t) => hasPhrase(f, t));
  });
  if (hits.length === 0) {
    return plain(
      ctx.memories.length ? "आपके सेव किए नोट्स में इस बारे में कुछ नहीं मिला। जो बात आप जानते हैं, उसे \"याद रखो ...\" लिखकर सेव कर सकते हैं। एलर्जी की पक्की जानकारी के लिए डॉक्टर से पूछें।" : "अभी कोई नोट सेव नहीं है, इसलिए इस बारे में मेरे पास कोई जानकारी नहीं है। जो बात आप जानते हैं, उसे \"याद रखो ...\" लिखकर सेव कर सकते हैं। एलर्जी की पक्की जानकारी के लिए डॉक्टर से पूछें।",
      ctx.memories.length ? 'Nothing in the notes you saved covers this. You can save what you know by writing "remember ...". For a reliable answer on allergies, ask the doctor.' : 'No notes are saved yet, so I have no information on this. You can save what you know by writing "remember ...". For a reliable answer on allergies, ask the doctor.',
    );
  }
  return plain(`आपके सेव किए नोट्स में दर्ज है: ${hits.slice(0, 5).map((m) => `"${m.content}"`).join("; ")}।`, `Your saved notes say: ${hits.slice(0, 5).map((m) => `"${m.content}"`).join("; ")}.`);
}

const SYMPTOM_CAUTION: Bi = {
  hi: "लक्षणों (दर्द, चक्कर, कमज़ोरी जैसी बातों) का आकलन यह ऐप नहीं कर सकता। लक्षण नए, अचानक या तेज़ हों तो तुरंत डॉक्टर से मिलें या 112/108 पर कॉल करें। डॉक्टर को दिखाने के लिए नीचे BP का हाल है।",
  en: "This app cannot assess symptoms such as pain, dizziness or weakness. If they are new, sudden or severe, see a doctor at once or call 112/108. The BP picture below is something to show the doctor.",
};

const SYMPTOM_SHORT: Bi = {
  hi: "(लक्षण नए, अचानक या तेज़ हों तो तुरंत डॉक्टर से मिलें या 112/108 पर कॉल करें; यह ऐप लक्षणों का आकलन नहीं कर सकता।)",
  en: "(If symptoms are new, sudden or severe, see a doctor at once or call 112/108; this app cannot assess symptoms.)",
};

const MODE_LABEL: Record<string, Bi> = {
  latest: { hi: "आख़िरी दर्ज एंट्री", en: "latest entry" },
  value: { hi: "दर्ज आँकड़े", en: "logged values" },
  average: { hi: "औसत / सारांश", en: "average / summary" },
  trend: { hi: "रुझान", en: "trend" },
  compare: { hi: "तुलना", en: "comparison" },
  goal: { hi: "लक्ष्य से तुलना", en: "versus target" },
  adherence: { hi: "दवा पालन", en: "adherence" },
  missing: { hi: "क्या दर्ज नहीं हुआ", en: "what is not logged" },
  summary: { hi: "सारांश", en: "summary" },
  schedule: { hi: "दवा का समय", en: "medicine schedule" },
  extreme: { hi: "सबसे ज़्यादा / कम", en: "highest / lowest" },
};

/** Says out loud how the question was understood, so a misreading is visible instead of silent. */
function understood(mode: string, metrics: Metric[], span: Period | null, defaulted = false): Bi {
  const names = metrics.filter((x) => x !== "pulse").map((x) => METRIC_NAME[x]);
  const base = span ? spanLabel(span) : null;
  const lbl = base && defaulted ? { hi: `${base.hi} (अवधि नहीं बताई, इसलिए पूरा पढ़ा गया इतिहास)`, en: `${base.en} (no period given, so the whole history I read)` } : base;
  const label = MODE_LABEL[mode];
  const hi = [names.length ? names.map((n) => n.hi).join(" + ") : null, lbl?.hi ?? null, label?.hi ?? null].filter(Boolean).join(" · ");
  const en = [names.length ? names.map((n) => n.en).join(" + ") : null, lbl?.en ?? null, label?.en ?? null].filter(Boolean).join(" · ");
  return { hi: `(मैंने सवाल ऐसे समझा: ${hi}। यह आपका सवाल नहीं था तो थोड़ा अलग तरह से पूछिए।)`, en: `(I read the question as: ${en}. If that is not what you asked, please rephrase.)` };
}

// ---------------------------------------------------------------------------
// Rule-based recommendations (deterministic, from ledger flags)
// ---------------------------------------------------------------------------

function ruleRecommendations(ctx: PatientContext, ledger: Ledger): Recommendation[] {
  const recs: Recommendation[] = [];
  const has = (id: string) => ledger.flags.some((f) => f.id === id);
  if (has("bp_above_target_7d") || has("bp_alert_7d")) {
    recs.push({ text: "पिछले 7 दिन का BP डेटा डॉक्टर को दिखाएँ और पूछें कि क्या इलाज की समीक्षा चाहिए।", kind: "ask_doctor", basis: "patient_data", source_urls: [] });
  }
  if (has("bp_gap")) recs.push({ text: "रोज़ सुबह और शाम एक ही समय पर BP नापकर दर्ज करें।", kind: "monitoring", basis: "patient_data", source_urls: [] });
  if (has("meds_low_7d") || has("meds_missed_today")) {
    recs.push({ text: "दवा के लिए फ़ोन रिमाइंडर या पिल-बॉक्स इस्तेमाल करें। कोई खुराक छूट जाए तो क्या करना है, यह डॉक्टर या फार्मासिस्ट से पूछें; अपने आप खुराक न बदलें।", kind: "monitoring", basis: "patient_data", source_urls: [] });
  }
  if (has("sodium_high_30d")) {
    recs.push({ text: `दर्ज खाने में सोडियम सामान्य सीमा (${SODIUM_LIMIT_MG_PER_DAY} mg/दिन; हाई BP में आदर्श ${SODIUM_IDEAL_MG_PER_DAY} mg) से ज़्यादा है: अचार, पापड़, नमकीन, तला-भुना और ऊपर से नमक कम करें।`, kind: "diet", basis: "patient_data", source_urls: [] });
  }
  if (has("calories_high_30d")) recs.push({ text: "थाली में तला-भुना और मीठा कम करें और सब्ज़ी-दाल का हिस्सा बढ़ाएँ।", kind: "diet", basis: "general", source_urls: [] });
  if (has("steps_low_7d")) recs.push({ text: "खाने के बाद थोड़ी देर टहलने से शुरुआत करें; डॉक्टर की सलाह के अनुसार धीरे-धीरे बढ़ाएँ।", kind: "lifestyle", basis: "general", source_urls: [] });
  if (has("sleep_short_7d")) recs.push({ text: "सोने और उठने का समय रोज़ एक जैसा रखें; रात को चाय-कॉफ़ी कम करें।", kind: "lifestyle", basis: "general", source_urls: [] });
  if (has("weight_rapid_7d") || has("weight_rapid_30d")) recs.push({ text: "वज़न में तेज़ बदलाव डॉक्टर को बताएँ।", kind: "ask_doctor", basis: "patient_data", source_urls: [] });
  return recs.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function pickMode(intents: Intent[], metrics: Metric[], spans: Span[]): Mode {
  if (intents.includes("advice") && !intents.includes("compare")) return "advice";
  if (intents.includes("missing")) return "missing";
  if (intents.includes("compare")) return "compare";
  if (intents.includes("extreme")) return "extreme";
  if (intents.includes("goal_gap")) return "goal";
  if (intents.includes("trend")) return "trend";
  if (intents.includes("average")) return "average";
  if (metrics.includes("medicine") && (intents.includes("adherence") || spans.length === 0)) return "adherence";
  if (intents.includes("adherence")) return "adherence";
  // A multi-day window asks for a summary of the window, even with words like "kitna".
  if (spans.length === 1 && spans[0].kind === "range") return "average";
  if (intents.includes("value") || (spans.length === 1 && spans[0].kind === "day")) return "value";
  if (intents.includes("latest")) return "latest";
  if (intents.includes("summary")) return "summary";
  if (metrics.length === 0 && spans.length > 0) return "summary";
  return "latest";
}

function previousPeriod(p: Period): Period {
  const len = daysBetweenIST(p.from, p.to) + 1;
  return { from: addDaysIST(p.from, -len), to: addDaysIST(p.from, -1) };
}

function finish(
  ctx: PatientContext,
  ledger: Ledger,
  sec: Section,
  opts: {
    intent: string;
    span: Period | null;
    notes?: Bi[];
    extraRecs?: Recommendation[];
    needsDoctor?: boolean;
    refusal?: string;
    lead?: Bi;
    followUps?: string[];
    metrics: Metric[];
    spans: Period[];
    headline?: string;
    /** Small talk / out-of-scope answers: no data-driven suggestions (they would read as an answer to something else). */
    noRules?: boolean;
  },
): FallbackResult {
  const recs = [...(opts.extraRecs ?? []), ...(opts.noRules ? [] : ruleRecommendations(ctx, ledger))].slice(0, 6);
  const urgent = ledger.flags.some((f) => f.severity === "urgent");
  const attention = urgent || ledger.flags.some((f) => f.severity === "attention");
  const notesHi = (opts.notes ?? []).map((n) => n.hi).join(" ");
  const notesEn = (opts.notes ?? []).map((n) => n.en).join(" ");
  const span = opts.span ?? { from: ctx.range.from, to: ctx.today };
  const conf = sec.n === 0 ? "low" : sec.n >= 5 ? "high" : "medium";
  const answer: AnswerDraft = {
    headline: opts.headline ?? firstSentence(sec.hi),
    answer_hi: [opts.lead?.hi, sec.hi, notesHi].filter(Boolean).join("\n"),
    answer_en: [opts.lead?.en, sec.en, notesEn].filter(Boolean).join("\n"),
    key_points: sec.kp.slice(0, 8),
    numbers: sec.nums.slice(0, 14),
    recommendations: recs,
    sources: [],
    confidence: conf,
    data_coverage: { metrics: sec.metrics.filter((m) => m !== "pulse").map(String), range: { from: span.from < ctx.range.from ? ctx.range.from : span.from, to: span.to > ctx.today ? ctx.today : span.to }, n: sec.n },
    needs_doctor: Boolean(opts.needsDoctor) || urgent,
    safety_level: urgent ? "escalate" : attention ? "attention" : "info",
    follow_up_questions: opts.followUps ?? defaultFollowUps(opts.metrics),
    refusal: opts.refusal ?? "",
  };
  return { answer, intent: opts.intent, metrics: opts.metrics, spans: opts.spans };
}

function firstSentence(s: string): string {
  const cut = s.split(/[।\n]/)[0].trim();
  return (cut.length > 150 ? `${cut.slice(0, 147)}...` : cut) || "SwasthTrack";
}

function defaultFollowUps(metrics: Metric[]): string[] {
  const out: string[] = [];
  if (!metrics.includes("bp")) out.push("पिछले 7 दिन का average BP क्या रहा?");
  if (!metrics.includes("medicine")) out.push("इस हफ़्ते दवा पालन कैसा रहा?");
  if (!metrics.includes("food")) out.push("कल खाने में क्या दर्ज है?");
  out.push("पिछले हफ़्ते से क्या बदला?");
  return out.slice(0, 4);
}

export function answerWithRules(input: FallbackInput): FallbackResult {
  const { ctx, ledger } = input;
  const safety = input.safety ?? assessSafety(input.message, { latestBP: ctx.bp[ctx.bp.length - 1] ?? null, thresholds: ctx.goals.bp, now: new Date(ctx.generatedAt) });
  const text = safety.sanitized;
  // A medicine named in the question ("amlodipine li kya?") makes it a medicine question even without the word "dawai".
  const namedMeds = matchMedicines(text, ctx.medicines);
  const rawMetrics = detectMetrics(text);
  const metrics: Metric[] = namedMeds.length && !rawMetrics.includes("medicine") ? [...rawMetrics, "medicine"] : rawMetrics;
  const intents = detectIntents(text);
  // Word order must not decide whether this is advice ("BP kam kaise karein" vs "kaise karein BP kam").
  const adviceAsked = detectAdviceQuestion(text);
  if (adviceAsked && !intents.includes("advice")) intents.push("advice");
  const untracked = detectUntracked(text);
  const tr = resolveTemporal(text, ctx.today);
  const spans = tr.spans;
  const spanNotes: Bi[] = spans
    .filter((s) => s.note)
    .map((s) => noteBi(s.note!))
    .map((n) => ({ hi: `(${n.hi})`, en: `(${n.en})` }));
  const early = spans.find((s) => s.from < ctx.range.from);
  if (early) {
    spanNotes.push({
      hi: `(ध्यान दें: मैंने सिर्फ़ ${formatDateHi(ctx.range.from)} से आज तक का डेटा पढ़ा है, उससे पहले का नहीं।)`,
      en: `(Note: I only read data from ${formatDateEn(ctx.range.from)} to today, nothing earlier.)`,
    });
  }
  const allMetrics: Metric[] = ["bp", "weight", "food", "sleep", "steps", "medicine"];

  // 0. Small talk.
  const talk = detectSmallTalk(text);
  if (talk) {
    return finish(ctx, ledger, smallTalkSection(talk), { intent: talk, span: null, metrics: [], spans: [], noRules: true, headline: talk === "greeting" ? "नमस्ते! पूछिए" : "आपका स्वागत है", followUps: ["आज पापा कैसे रहे?", "पिछले 7 दिन का average BP क्या रहा?", "इस हफ़्ते दवा पालन कैसा रहा?"] });
  }

  // 1. Requests the app must not act on: explain and refer to the doctor.
  if (safety.medicineChangeRequest || safety.diagnosisRequest) {
    const span = { from: addDaysIST(ctx.today, -29), to: ctx.today };
    const med = medicineSection(ctx, ledger, span);
    const bp = bpSection(ctx, ledger, { from: addDaysIST(ctx.today, -6), to: ctx.today }, "average");
    const what = safety.medicineChangeRequest
      ? { hi: "दवा शुरू करना, बंद करना या खुराक बदलना सिर्फ़ डॉक्टर तय कर सकते हैं; ऐप यह नहीं बता सकता।", en: "Starting, stopping or changing a medicine or dose is a decision only the doctor can make; this app cannot advise on it." }
      : { hi: "ऐप कोई बीमारी तय (डायग्नोज़) नहीं कर सकता; इसके लिए डॉक्टर से जाँच ज़रूरी है।", en: "This app cannot diagnose a condition; that needs a doctor's examination." };
    const recorded: Section = safety.diagnosisRequest
      ? plain(
          ctx.conditions.length ? `ऐप में दर्ज स्थितियाँ: ${ctx.conditions.map((c) => `${c.name}${c.year ? ` (${c.year} से)` : ""}`).join(", ")}।` : "ऐप में कोई बीमारी/स्थिति दर्ज नहीं है।",
          ctx.conditions.length ? `Conditions recorded in the app: ${ctx.conditions.map((c) => `${c.name}${c.year ? ` (since ${c.year})` : ""}`).join(", ")}.` : "No condition is recorded in the app.",
        )
      : plain("", "");
    // BP numbers belong to a BP / stroke / heart question; for "diabetes hai kya" they would be an answer to something else.
    const bpRelevant = safety.medicineChangeRequest || metrics.includes("bp") || containsAnyPhrase(text, ["hypertension", "stroke", "heart", "हाइपरटेंशन", "स्ट्रोक", "हार्ट", "दिल"]);
    const sec = mergeSections([{ ...what, kp: [], nums: [], metrics: [], n: 0 }, ...(safety.diagnosisRequest ? [recorded] : []), ...(safety.medicineChangeRequest ? [med] : []), ...(bpRelevant ? [bp] : [])]);
    return finish(ctx, ledger, sec, {
      intent: safety.medicineChangeRequest ? "medicine_change_refusal" : "diagnosis_refusal",
      span,
      needsDoctor: true,
      refusal: safety.medicineChangeRequest ? "दवा/खुराक बदलने की सलाह नहीं दी जा सकती" : "बीमारी तय करने की सलाह नहीं दी जा सकती",
      extraRecs: [{ text: "डॉक्टर के पास ये ऐप के आँकड़े (BP, दवा पालन, लक्षण और उनका समय) साथ ले जाएँ और सीधे यही सवाल पूछें।", kind: "ask_doctor", basis: "patient_data", source_urls: [] }],
      metrics: safety.medicineChangeRequest ? ["medicine", "bp"] : bpRelevant ? ["bp"] : [],
      spans: [span],
    });
  }

  // 1b. The user typed a reading: classify THAT reading.
  const typed = readingsInMessage(text);
  if (typed.length > 0 && !intents.some((i) => i === "average" || i === "trend" || i === "compare" || i === "missing")) {
    const { sec, needsDoctor } = typedReadingSection(ctx, typed);
    return finish(ctx, ledger, sec, {
      intent: "typed_reading",
      span: null,
      metrics: ["bp"],
      spans: [],
      needsDoctor,
      extraRecs: needsDoctor ? [{ text: "यह रीडिंग और लक्षण (अगर कोई हों) डॉक्टर को बताएँ; दवा अपने आप न बदलें।", kind: "ask_doctor", basis: "general", source_urls: [] }] : [],
      headline: `आपका बताया BP ${typed[0].systolic}/${typed[0].diastolic}`,
      followUps: ["पिछले 7 दिन का average BP क्या रहा?", "आख़िरी दर्ज BP क्या है?"],
    });
  }

  // 2. Dates that do not exist.
  if (tr.invalid.length > 0) {
    const sec: Section = { hi: `"${tr.invalid.join('", "')}" असली तारीख़ नहीं है। कृपया सही तारीख़ (जैसे 15 अगस्त या 15/08) के साथ दोबारा पूछें।`, en: `"${tr.invalid.join('", "')}" is not a real calendar date. Please ask again with a valid date (for example 15 August or 15/08).`, kp: [], nums: [], metrics: [], n: 0 };
    return finish(ctx, ledger, sec, { intent: "invalid_date", span: null, metrics: [], spans: [], followUps: ["आज पापा कैसे रहे?"] });
  }

  // 3. The future has no data.
  const future = spans.find((s) => s.future && s.from > ctx.today);
  if (future) {
    const sec: Section = { hi: `${formatDateHi(future.from)} अभी आया नहीं है, इसलिए उसका कोई डेटा नहीं है। मैं सिर्फ़ दर्ज हो चुके आँकड़े बता सकता हूँ।`, en: `${formatDateEn(future.from)} has not happened yet, so there is no data for it. I can only report what has been logged.`, kp: [], nums: [], metrics: [], n: 0 };
    return finish(ctx, ledger, sec, { intent: "future_date", span: null, metrics: [], spans: [{ from: future.from, to: future.to }] });
  }

  const mode = pickMode(intents, metrics, spans);
  const first = spans[0] ? { from: spans[0].from, to: spans[0].to } : null;
  const mealKey = MEAL_WORDS.find((m) => containsAnyPhrase(text, m.words))?.key ?? null;
  const metricList = metrics.filter((m) => m !== "pulse" || metrics.length === 1).map((m) => (m === "pulse" ? "bp" : m));
  const uniqueMetrics = Array.from(new Set(metricList)) as Metric[];
  const pulseOnly = metrics.length === 1 && metrics[0] === "pulse";
  const symptom = detectSymptomMention(text);
  // Short notes that ride along with a data answer: a part of the question we cannot answer, or a symptom to take to the doctor.
  const unrelatedNote: Bi[] = [...(untracked.length && uniqueMetrics.length ? [untrackedNote(untracked)] : []), ...(symptom && uniqueMetrics.length ? [SYMPTOM_SHORT] : [])];

  // 3b. Questions that are not about the patient's tracked data must not be answered with patient data.
  if (detectMemoryLookup(text)) {
    return finish(ctx, ledger, memorySection(ctx, text), { intent: "saved_notes", span: null, metrics: [], spans: [], noRules: true, headline: "सेव किए नोट्स से", followUps: ["आज पापा कैसे रहे?", "इस हफ़्ते दवा पालन कैसा रहा?"] });
  }
  if (uniqueMetrics.length === 0) {
    if (symptom && mode !== "advice") {
      const sec = mergeSections([plain(SYMPTOM_CAUTION.hi, SYMPTOM_CAUTION.en), bpSection(ctx, ledger, null, "latest"), bpSection(ctx, ledger, { from: addDaysIST(ctx.today, -6), to: ctx.today }, "average")]);
      return finish(ctx, ledger, sec, { intent: "symptom_mention", span: null, metrics: ["bp"], spans: [], needsDoctor: true, headline: "लक्षणों के लिए डॉक्टर से संपर्क करें", extraRecs: [{ text: "लक्षण कब शुरू हुए, कितनी देर रहे और उस समय का BP नोट करके डॉक्टर को बताएँ।", kind: "ask_doctor", basis: "general", source_urls: [] }], followUps: ["पिछले 7 दिन का average BP क्या रहा?", "इस हफ़्ते दवा पालन कैसा रहा?"] });
    }
    if (detectOffTopic(text) && !hasHealthAnchor(text)) {
      const sec = plain(
        `यह सवाल मरीज़ के स्वास्थ्य से जुड़ा नहीं लगता, इसलिए मैं इसका जवाब नहीं दूँगा। मैं दर्ज ${TRACKED.hi} और सेहत से जुड़े सवालों में मदद कर सकता हूँ।`,
        `That does not look like a question about the patient's health, so I will not answer it. I can help with the logged ${TRACKED.en} and health questions.`,
      );
      return finish(ctx, ledger, sec, { intent: "out_of_scope", span: null, metrics: [], spans: [], noRules: true, headline: "यह सवाल सेहत से जुड़ा नहीं है", followUps: ["आज पापा कैसे रहे?", "पिछले 7 दिन का average BP क्या रहा?", "इस हफ़्ते दवा पालन कैसा रहा?"] });
    }
    if (untracked.length && mode !== "advice") {
      return finish(ctx, ledger, untrackedSection(untracked), { intent: `untracked:${untracked.map((u) => u.key).join("+")}`, span: null, metrics: [], spans: [], noRules: true, headline: `${untracked[0].hi} ऐप में दर्ज नहीं होता`, followUps: ["पिछले 7 दिन का average BP क्या रहा?", "इस हफ़्ते दवा पालन कैसा रहा?", "आज पापा कैसे रहे?"] });
    }
  }

  // 3c. "When / which medicine" is the plan, not the adherence record.
  const unknownDrug = uniqueMetrics.length === 0 && namedMeds.length === 0 && detectTakeWhen(text);
  if ((detectScheduleQuestion(text) && (uniqueMetrics.includes("medicine") || namedMeds.length > 0)) || unknownDrug) {
    const sec = scheduleSection(ctx, namedMeds);
    const unknownNote: Bi[] = unknownDrug ? [{ hi: "(आपने जिस दवा का नाम लिया वह दर्ज दवाओं में नहीं मिली, इसलिए नीचे दर्ज सभी दवाओं का समय है।)", en: "(The medicine you named is not among the recorded medicines, so here is the schedule of all recorded medicines.)" }] : [];
    return finish(ctx, ledger, sec, { intent: "medicine_schedule", span: null, metrics: ["medicine"], spans: [], notes: [...unknownNote, understood("schedule", ["medicine"], null), ...unrelatedNote], followUps: ["इस हफ़्ते दवा पालन कैसा रहा?", "आज कौन सी दवा बाकी है?"], headline: namedMeds.length ? `${namedMeds[0].name} का दर्ज समय` : "दर्ज दवाओं का समय" });
  }

  const oneMetric = (m: Metric, span: Period | null): Section => {
    const useMode: Mode = mode === "average" || mode === "trend" ? "average" : mode;
    switch (m) {
      case "bp":
        return bpSection(ctx, ledger, span ?? (useMode === "latest" ? null : { from: addDaysIST(ctx.today, -6), to: ctx.today }), useMode);
      case "weight":
        return weightSection(ctx, ledger, span ?? (useMode === "average" ? { from: addDaysIST(ctx.today, -29), to: ctx.today } : null), useMode);
      case "food":
        return foodSection(ctx, ledger, span ?? (useMode === "average" ? { from: addDaysIST(ctx.today, -6), to: ctx.today } : { from: ctx.today, to: ctx.today }), mealKey);
      case "sleep":
        return sleepSection(ctx, ledger, span);
      case "steps":
        return stepsSection(ctx, ledger, span);
      default:
        return medicineSection(ctx, ledger, span ?? { from: addDaysIST(ctx.today, -6), to: ctx.today }, namedMeds);
    }
  };

  // 4. Compare / what changed.
  if (mode === "compare") {
    const thisWeek = { from: startOfISOWeek(ctx.today), to: ctx.today };
    let a: Period;
    let b: Period;
    if (spans.length >= 2) {
      a = { from: spans[0].from, to: spans[0].to };
      b = { from: spans[1].from, to: spans[1].to };
    } else if (spans.length === 1) {
      const s = spans[0];
      // "last week se kya change hua": the question is current period vs that previous one.
      if (s.note?.includes("Previous Monday-Sunday")) {
        a = thisWeek;
        b = { from: s.from, to: s.to };
      } else if (s.note?.includes("Previous calendar month")) {
        a = { from: `${ctx.today.slice(0, 7)}-01`, to: ctx.today };
        b = { from: s.from, to: s.to };
      } else {
        a = { from: s.from, to: s.to };
        b = previousPeriod(a);
      }
    } else {
      a = thisWeek;
      b = { from: addDaysIST(thisWeek.from, -7), to: addDaysIST(thisWeek.from, -1) };
    }
    const ms = uniqueMetrics.length ? uniqueMetrics : allMetrics;
    const sec = compareSection(ctx, ms, a, b);
    return finish(ctx, ledger, sec, { intent: "compare", span: { from: b.from < a.from ? b.from : a.from, to: a.to > b.to ? a.to : b.to }, metrics: ms, spans: [a, b], notes: [...spanNotes, understood("compare", uniqueMetrics, null), ...unrelatedNote] });
  }

  if (mode === "goal") {
    const sec = goalSection(ctx, ledger, uniqueMetrics);
    return finish(ctx, ledger, sec, { intent: "goal_gap", span: null, metrics: sec.metrics, spans: [], notes: [understood("goal", sec.metrics, null), ...unrelatedNote] });
  }

  if (mode === "missing") {
    const span = first ?? { from: addDaysIST(ctx.today, -6), to: ctx.today };
    const sec = missingSection(ctx, span);
    return finish(ctx, ledger, sec, { intent: "missing", span, metrics: sec.metrics, spans: [span], notes: [...spanNotes, understood("missing", [], span)] });
  }

  if (mode === "extreme" && uniqueMetrics.length > 0) {
    const span = first ?? { from: ctx.range.from, to: ctx.today };
    const f = fold(text);
    const LOW = ["sabse kam", "sabse low", "sabse neeche", "sabse chhota", "lowest", "minimum", "सबसे कम", "सबसे छोटा"].map(fold);
    const HIGH = ["sabse zyada", "sabse jyada", "sabse jada", "sabse high", "sabse upar", "sabse bada", "highest", "maximum", "peak", "सबसे ज़्यादा", "सबसे ज्यादा", "सबसे ऊँचा", "सबसे ऊंचा", "सबसे ऊँची", "सबसे ऊंची", "सबसे बड़ा"].map(fold);
    const want = { high: HIGH.some((p) => hasPhrase(f, p)), low: LOW.some((p) => hasPhrase(f, p)) };
    const parts = uniqueMetrics.slice(0, 3).map((m) => (m === "medicine" ? medicineSection(ctx, ledger, span, namedMeds) : extremeSection(ctx, m, span, want, pulseOnly)));
    const sec = mergeSections(parts);
    return finish(ctx, ledger, sec, { intent: `extreme:${uniqueMetrics.join("+")}`, span, metrics: uniqueMetrics, spans: [span], notes: [...spanNotes, understood("extreme", uniqueMetrics, span, !first), ...unrelatedNote] });
  }

  if (mode === "advice") {
    const span = { from: addDaysIST(ctx.today, -29), to: ctx.today };
    const note: Bi = { hi: "यह सवाल सलाह (क्या करें / क्या खाएँ) का है। विस्तृत, स्रोत-सहित सलाह के लिए AI + इंटरनेट खोज चाहिए, जो अभी चालू नहीं है। नीचे आपके असली आँकड़े और नियम-आधारित सामान्य सुझाव हैं; इलाज के फ़ैसले डॉक्टर ही करेंगे।", en: "This is an advice question. Detailed, sourced advice needs the AI + web search, which is not active right now. Below are your actual numbers and rule-based general suggestions; treatment decisions belong to the doctor." };
    // Only the data the question is about. With no tracked topic ("kya karein?") show what the data flags, not a guessed metric.
    const sec: Section =
      uniqueMetrics.length > 0
        ? mergeSections(uniqueMetrics.map((m) => oneMetric(m, m === "food" || m === "bp" ? span : null)))
        : plain(ledger.flags.length ? "ध्यान देने लायक: " + ledger.flags.slice(0, 4).map((f) => f.textHi).join(" ") : "अभी दर्ज आँकड़ों में कोई ख़ास चेतावनी नहीं है।", ledger.flags.length ? "Worth noticing: " + ledger.flags.slice(0, 4).map((f) => f.textEn).join(" ") : "The logged data carries no particular warning right now.");
    const extras: Bi[] = [...(untracked.length ? [untrackedNote(untracked)] : []), ...(symptom ? [SYMPTOM_SHORT] : [])];
    return finish(ctx, ledger, { ...sec, hi: [note.hi, sec.hi, ...extras.map((x) => x.hi)].join("\n"), en: [note.en, sec.en, ...extras.map((x) => x.en)].join("\n") }, { intent: "advice_limited", span, metrics: sec.metrics, spans: [span], headline: "सलाह के लिए AI चालू नहीं है; आपके आँकड़े नीचे हैं" });
  }

  // 5. Summary of everything (e.g. "आज पापा कैसे रहे?").
  const wantsEverything = uniqueMetrics.length === 0;
  if (wantsEverything) {
    // A summary is only the right answer when the question names the patient / asks for a review.
    // A date or a "how is it" word alone ("aaj mausam kaisa hai") is not a health question.
    const summaryAsked = intents.includes("summary");
    if (!summaryAsked || mode === "extreme") {
      const sug = suggestCorrections(text);
      const hint = sug.length ? { hi: ` शायद आपका मतलब "${sug[0].suggestion}" था?`, en: ` Did you mean "${sug[0].suggestion}"?` } : { hi: "", en: "" };
      const dateOnly = spans.length > 0 || mode === "extreme";
      const sec: Section = dateOnly
        ? {
            hi: `मैं समझ नहीं पाया कि आप किस चीज़ के बारे में पूछ रहे हैं: BP, खाना, दवा, नींद, कदम या वज़न? जैसे: "कल का BP", "पिछले हफ़्ते की नींद", "आज की दवाएँ"।`,
            en: `I could not tell what you are asking about: BP, food, medicines, sleep, steps or weight? For example: "BP yesterday", "sleep last week", "today's medicines".`,
            kp: [],
            nums: [],
            metrics: [],
            n: 0,
          }
        : {
            hi: `मैं यह सवाल पूरी तरह समझ नहीं पाया।${hint.hi} आप ऐसे पूछ सकते हैं: "आज पापा कैसे रहे?", "पिछले 7 दिन का average BP", "कल खाने में क्या था?", "इस हफ़्ते दवा पालन", "वज़न लक्ष्य से कितना दूर है?"`,
            en: `I could not fully understand that question.${hint.en} You can ask things like: "How was Papa today?", "Average BP over the last 7 days", "What did he eat yesterday?", "Medicine adherence this week", "How far is the weight from target?"`,
            kp: [],
            nums: [],
            metrics: [],
            n: 0,
          };
      return finish(ctx, ledger, sec, { intent: dateOnly ? "clarify_topic" : "unrecognised", span: null, metrics: [], spans: [], noRules: true, headline: "सवाल समझ नहीं आया", followUps: ["आज पापा कैसे रहे?", "पिछले 7 दिन का average BP क्या रहा?", "इस हफ़्ते दवा पालन कैसा रहा?"] });
    }
    const span = first ?? { from: ctx.today, to: ctx.today };
    const sec = summarySection(ctx, ledger, span);
    const flags = ledger.flags.length ? { hi: "ध्यान देने लायक: " + ledger.flags.slice(0, 4).map((f) => f.textHi).join(" "), en: "Worth noticing: " + ledger.flags.slice(0, 4).map((f) => f.textEn).join(" ") } : null;
    return finish(ctx, ledger, flags && span.from === span.to ? { ...sec, hi: `${sec.hi}\n${flags.hi}`, en: `${sec.en}\n${flags.en}` } : sec, { intent: span.from === span.to ? "daily_summary" : "period_summary", span, metrics: sec.metrics, spans: [span], notes: [...spanNotes, ...unrelatedNote] });
  }

  // 6. One or more specific metrics.
  const parts = uniqueMetrics.slice(0, 3).map((m) => oneMetric(m, first));
  const sec = mergeSections(parts);
  return finish(ctx, ledger, sec, { intent: `${mode}:${uniqueMetrics.join("+")}`, span: first, metrics: uniqueMetrics, spans: first ? [first] : [], notes: [...spanNotes, understood(mode, uniqueMetrics.slice(0, 3), first), ...unrelatedNote] });
}
