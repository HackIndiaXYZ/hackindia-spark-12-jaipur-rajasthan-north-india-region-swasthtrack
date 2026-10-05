/**
 * "What changed" maths (pure): the recent window vs the window right before it,
 * both IST calendar-day windows of equal length. Medians, not means, so one odd
 * reading cannot move a result. There is NO fallback reference: when the earlier
 * window has no data the metric says so instead of comparing with a baseline
 * that already contains the recent days.
 */
import {
  ADHERENCE_LOW_PCT,
  BP_TREND_DELTA_MMHG,
  BP_TREND_MIN_READINGS,
  FOOD_LOG_DAYS_CHANGE_PCT,
  SLEEP_CHANGE_HOURS,
  STEPS_CHANGE_PCT,
  WEIGHT_STABLE_KG,
  median,
  round,
} from "../health-rules";
import { summarizeAdherence, type DoseRecord } from "./adherence";
import { inWindow, type DateWindow } from "./dates";

export type TrendDirection = "up" | "down" | "stable";
export type MetricConfidence = "high" | "medium" | "low";

export interface MetricHealthChange {
  metric: string;
  metricHi: string;
  unit: string;
  /** False when there is not enough data (in either window) to say anything. */
  isSufficient: boolean;
  insufficientReasonHi?: string;
  /** Median (or level) of the recent window; 0 when there is no recent data. */
  recentValue: number;
  /** Median (or level) of the earlier window; 0 when there is none (see hasReference). */
  referenceValue: number;
  difference: number;
  percentChange: number;
  direction: TrendDirection;
  directionLabelHi: string;
  confidence: MetricConfidence;
  confidenceLabelHi: string;
  dataPoints: number;
  explanation: string;
  explanationHi: string;
  personalPatternRange?: string;
  isPersistent: boolean;
  /** For ranking changes; 0 when insufficient. */
  importanceScore: number;
  /** Whether the earlier window had data to compare with. */
  hasReference: boolean;
  referencePoints: number;
}

export interface ChangesInput {
  recent: DateWindow;
  reference: DateWindow;
  steps: Array<{ day: string; steps: number }>;
  sleep: Array<{ day: string; hours: number }>;
  bp: Array<{ day: string; systolic: number }>;
  weights: Array<{ day: string; kg: number }>;
  /** Distinct IST days that have any food log. */
  foodDays: string[];
  /** Due doses across both windows. */
  doses: DoseRecord[];
}

const confLabel: Record<MetricConfidence, string> = {
  high: "उच्च (High)",
  medium: "मध्यम (Medium)",
  low: "सीमित डेटा",
};

function conf(recent: number, reference: number, highAt: number): MetricConfidence {
  const m = Math.min(recent, reference);
  if (m >= highAt) return "high";
  return m >= 2 ? "medium" : "low";
}

function insufficient(
  metric: string,
  metricHi: string,
  unit: string,
  recentPts: number,
  refPts: number,
  recentValue: number,
  need: string,
): MetricHealthChange {
  return {
    metric,
    metricHi,
    unit,
    isSufficient: false,
    insufficientReasonHi: `तुलना के लिए अभी पर्याप्त डेटा नहीं है (${need})।`,
    recentValue,
    referenceValue: 0,
    difference: 0,
    percentChange: 0,
    direction: "stable",
    directionLabelHi: "डेटा प्रतीक्षारत",
    confidence: "low",
    confidenceLabelHi: confLabel.low,
    dataPoints: recentPts,
    explanation: "Not enough data in one of the two periods to compare.",
    explanationHi: `तुलना के लिए दोनों अवधियों में डेटा चाहिए (हाल: ${recentPts}, पिछला: ${refPts})।`,
    isPersistent: false,
    importanceScore: 0,
    hasReference: refPts > 0,
    referencePoints: refPts,
  };
}

function rangeText(values: number[], unit: string, decimals = 0): string | undefined {
  if (values.length < 2) return undefined;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const f = (n: number) => (decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString("en-IN"));
  return `${f(lo)}–${f(hi)} ${unit}`;
}

export function computeChanges(input: ChangesInput): MetricHealthChange[] {
  const out: MetricHealthChange[] = [];
  const rIn = (d: string) => inWindow(d, input.recent);
  const pIn = (d: string) => inWindow(d, input.reference);

  // ---- steps (% change of the median) ----
  {
    const rec = input.steps.filter((s) => rIn(s.day) && s.steps > 0).map((s) => s.steps);
    const ref = input.steps.filter((s) => pIn(s.day) && s.steps > 0).map((s) => s.steps);
    if (rec.length < 2 || ref.length < 2) {
      out.push(insufficient("daily_steps", "दैनिक कदम (Steps)", "कदम/दिन", rec.length, ref.length, median(rec) ?? 0, "हर अवधि में कम से कम 2 दिन के कदम"));
    } else {
      const rm = median(rec) as number;
      const pm = median(ref) as number;
      const diff = Math.round(rm - pm);
      const pct = pm > 0 ? round((diff / pm) * 100, 1) : 0;
      const dir: TrendDirection = pct >= STEPS_CHANGE_PCT ? "up" : pct <= -STEPS_CHANGE_PCT ? "down" : "stable";
      const c = conf(rec.length, ref.length, 4);
      const persistent = rec.length >= 4 && Math.abs(pct) >= STEPS_CHANGE_PCT * 1.2;
      out.push({
        metric: "daily_steps",
        metricHi: "दैनिक कदम (Steps)",
        unit: "कदम/दिन",
        isSufficient: true,
        recentValue: rm,
        referenceValue: pm,
        difference: diff,
        percentChange: pct,
        direction: dir,
        directionLabelHi: dir === "up" ? `बढ़ोतरी (+${STEPS_CHANGE_PCT}% या अधिक)` : dir === "down" ? `कमी (-${STEPS_CHANGE_PCT}% या अधिक)` : "स्थिर (Stable)",
        confidence: c,
        confidenceLabelHi: confLabel[c],
        dataPoints: rec.length,
        explanation: `Median ${rm.toLocaleString("en-IN")} steps/day vs ${pm.toLocaleString("en-IN")} in the period before.`,
        explanationHi: `कदम ${dir === "up" ? "बढ़े हैं" : dir === "down" ? "घटे हैं" : "लगभग स्थिर रहे हैं"} (हालिया मीडियन ${rm.toLocaleString("en-IN")} बनाम पिछला ${pm.toLocaleString("en-IN")})।`,
        personalPatternRange: rangeText(ref, "कदम"),
        isPersistent: persistent,
        importanceScore: (Math.abs(pct) / STEPS_CHANGE_PCT) * 10 * (c === "high" ? 1.5 : 1) * (persistent ? 1.3 : 1),
        hasReference: true,
        referencePoints: ref.length,
      });
    }
  }

  // ---- sleep ----
  {
    const rec = input.sleep.filter((s) => rIn(s.day) && s.hours > 0).map((s) => s.hours);
    const ref = input.sleep.filter((s) => pIn(s.day) && s.hours > 0).map((s) => s.hours);
    if (rec.length < 2 || ref.length < 2) {
      out.push(insufficient("sleep_duration", "नींद की अवधि (Sleep)", "घंटे/रात", rec.length, ref.length, median(rec) ?? 0, "हर अवधि में कम से कम 2 रात की नींद"));
    } else {
      const rm = round(median(rec) as number, 1);
      const pm = round(median(ref) as number, 1);
      const diff = round(rm - pm, 1);
      const pct = pm > 0 ? round((diff / pm) * 100, 1) : 0;
      const dir: TrendDirection = diff >= SLEEP_CHANGE_HOURS ? "up" : diff <= -SLEEP_CHANGE_HOURS ? "down" : "stable";
      const c = conf(rec.length, ref.length, 4);
      const persistent = rec.length >= 3 && Math.abs(diff) >= SLEEP_CHANGE_HOURS * 1.4;
      out.push({
        metric: "sleep_duration",
        metricHi: "नींद की अवधि (Sleep)",
        unit: "घंटे/रात",
        isSufficient: true,
        recentValue: rm,
        referenceValue: pm,
        difference: diff,
        percentChange: pct,
        direction: dir,
        directionLabelHi: dir === "up" ? "नींद की अवधि में वृद्धि" : dir === "down" ? "नींद की अवधि में कमी" : "स्थिर (Stable)",
        confidence: c,
        confidenceLabelHi: confLabel[c],
        dataPoints: rec.length,
        explanation: `Median sleep ${rm} h vs ${pm} h in the period before.`,
        explanationHi: `नींद ${dir === "up" ? "ज़्यादा रही" : dir === "down" ? "कम रही" : "लगभग स्थिर रही"} (${rm} घंटे बनाम पिछले ${pm} घंटे)।`,
        personalPatternRange: rangeText(ref, "घंटे", 1),
        isPersistent: persistent,
        importanceScore: (Math.abs(diff) / SLEEP_CHANGE_HOURS) * 10 * (c === "high" ? 1.5 : 1) * (persistent ? 1.3 : 1),
        hasReference: true,
        referencePoints: ref.length,
      });
    }
  }

  // ---- blood pressure (median systolic) ----
  {
    const rec = input.bp.filter((b) => rIn(b.day)).map((b) => b.systolic);
    const ref = input.bp.filter((b) => pIn(b.day)).map((b) => b.systolic);
    const need = Math.min(2, BP_TREND_MIN_READINGS);
    if (rec.length < need || ref.length < need) {
      out.push(insufficient("systolic_bp", "सिस्टोलिक ब्लड प्रेशर (BP)", "mmHg", rec.length, ref.length, median(rec) ?? 0, `हर अवधि में कम से कम ${need} रीडिंग`));
    } else {
      const rm = Math.round(median(rec) as number);
      const pm = Math.round(median(ref) as number);
      const diff = rm - pm;
      const pct = pm > 0 ? round((diff / pm) * 100, 1) : 0;
      const dir: TrendDirection = diff >= BP_TREND_DELTA_MMHG ? "up" : diff <= -BP_TREND_DELTA_MMHG ? "down" : "stable";
      const c = conf(rec.length, ref.length, 5);
      const persistent = rec.length >= 4 && Math.abs(diff) >= BP_TREND_DELTA_MMHG;
      out.push({
        metric: "systolic_bp",
        metricHi: "सिस्टोलिक ब्लड प्रेशर (BP)",
        unit: "mmHg",
        isSufficient: true,
        recentValue: rm,
        referenceValue: pm,
        difference: diff,
        percentChange: pct,
        direction: dir,
        directionLabelHi: dir === "up" ? `पिछले दौर से अधिक (+${BP_TREND_DELTA_MMHG} mmHg या ज़्यादा)` : dir === "down" ? `पिछले दौर से कम (-${BP_TREND_DELTA_MMHG} mmHg या ज़्यादा)` : "स्थिर (Stable)",
        confidence: c,
        confidenceLabelHi: confLabel[c],
        dataPoints: rec.length,
        explanation: `Median systolic ${rm} mmHg vs ${pm} mmHg in the period before.`,
        explanationHi: `सिस्टोलिक BP का मीडियन ${dir === "up" ? "बढ़ा" : dir === "down" ? "घटा" : "लगभग स्थिर रहा"} (${rm} mmHg बनाम पिछला ${pm} mmHg)।`,
        personalPatternRange: rangeText(ref, "mmHg"),
        isPersistent: persistent,
        importanceScore: (Math.abs(diff) / BP_TREND_DELTA_MMHG) * 10 * 1.5 * (c === "high" ? 1.5 : 1) * (persistent ? 1.3 : 1),
        hasReference: true,
        referencePoints: ref.length,
      });
    }
  }

  // ---- weight ----
  {
    const rec = input.weights.filter((w) => rIn(w.day)).map((w) => w.kg);
    const ref = input.weights.filter((w) => pIn(w.day)).map((w) => w.kg);
    if (rec.length < 1 || ref.length < 1) {
      out.push(insufficient("body_weight", "शारीरिक वज़न (Weight)", "kg", rec.length, ref.length, median(rec) ?? 0, "हर अवधि में कम से कम 1 माप"));
    } else {
      const rm = round(median(rec) as number, 1);
      const pm = round(median(ref) as number, 1);
      const diff = round(rm - pm, 1);
      const pct = pm > 0 ? round((diff / pm) * 100, 1) : 0;
      const dir: TrendDirection = diff >= WEIGHT_STABLE_KG ? "up" : diff <= -WEIGHT_STABLE_KG ? "down" : "stable";
      const c: MetricConfidence = rec.length >= 3 && ref.length >= 3 ? "high" : rec.length >= 2 && ref.length >= 2 ? "medium" : "low";
      const persistent = rec.length >= 2 && Math.abs(diff) >= WEIGHT_STABLE_KG * 2;
      out.push({
        metric: "body_weight",
        metricHi: "शारीरिक वज़न (Weight)",
        unit: "kg",
        isSufficient: true,
        recentValue: rm,
        referenceValue: pm,
        difference: diff,
        percentChange: pct,
        direction: dir,
        directionLabelHi: dir === "up" ? "वज़न में वृद्धि" : dir === "down" ? "वज़न में कमी" : "स्थिर (Stable)",
        confidence: c,
        confidenceLabelHi: confLabel[c],
        dataPoints: rec.length,
        explanation: `Median weight ${rm} kg vs ${pm} kg in the period before.`,
        explanationHi: `वज़न ${dir === "up" ? "बढ़ा है" : dir === "down" ? "घटा है" : "लगभग स्थिर है"} (${rm} kg बनाम पिछला ${pm} kg)।`,
        personalPatternRange: rangeText(ref, "kg", 1),
        isPersistent: persistent,
        importanceScore: (Math.abs(diff) / WEIGHT_STABLE_KG) * 10 * 1.2 * (persistent ? 1.3 : 1),
        hasReference: true,
        referencePoints: ref.length,
      });
    }
  }

  // ---- medicine adherence (real doses, taken + late) ----
  {
    const rec = summarizeAdherence(input.doses.filter((d) => rIn(d.date)));
    const ref = summarizeAdherence(input.doses.filter((d) => pIn(d.date)));
    if (rec.evaluated < 3 || rec.pct === null) {
      out.push(insufficient("medicine_adherence", "दवाइयाँ लेने की नियमितता (Meds)", "%", rec.evaluated, ref.evaluated, rec.pct ?? 0, "कम से कम 3 खुराकों का रिकॉर्ड"));
    } else {
      const hasRef = ref.evaluated >= 3 && ref.pct !== null;
      const diff = hasRef ? rec.pct - (ref.pct as number) : 0;
      const dir: TrendDirection = hasRef ? (diff >= 10 ? "up" : diff <= -10 ? "down" : "stable") : "stable";
      const c = conf(rec.evaluated, hasRef ? ref.evaluated : rec.evaluated, 7);
      const low = rec.pct < ADHERENCE_LOW_PCT;
      out.push({
        metric: "medicine_adherence",
        metricHi: "दवाइयाँ लेने की नियमितता (Meds)",
        unit: "%",
        isSufficient: true,
        recentValue: rec.pct,
        referenceValue: hasRef ? (ref.pct as number) : 0,
        difference: diff,
        percentChange: hasRef && (ref.pct as number) > 0 ? round((diff / (ref.pct as number)) * 100, 1) : 0,
        direction: dir,
        directionLabelHi: !hasRef ? "तुलना के लिए पिछला डेटा नहीं" : dir === "up" ? "नियमितता बढ़ी" : dir === "down" ? "नियमितता घटी" : "स्थिर (Stable)",
        confidence: c,
        confidenceLabelHi: confLabel[c],
        dataPoints: rec.evaluated,
        explanation: `${rec.adherent} of ${rec.evaluated} due doses taken (${rec.pct}%)${rec.missed ? `, ${rec.missed} missed` : ""}.`,
        explanationHi: `समय आ चुकी ${rec.evaluated} खुराकों में से ${rec.adherent} ली गईं (${rec.pct}%)${rec.missed ? `, ${rec.missed} छूटीं` : ""}।`,
        personalPatternRange: hasRef ? `पिछले दौर में ${ref.pct}%` : undefined,
        isPersistent: low,
        importanceScore: low ? ((100 - rec.pct) / 10) * 2 : Math.abs(diff) / 10,
        hasReference: hasRef,
        referencePoints: ref.evaluated,
      });
    }
  }

  // ---- food logging consistency (days with any food logged) ----
  {
    const days = input.recent.days;
    const rec = new Set(input.foodDays.filter(rIn)).size;
    const ref = new Set(input.foodDays.filter(pIn)).size;
    if (rec === 0 && ref === 0) {
      out.push(insufficient("food_consistency", "भोजन दर्ज करने की निरंतरता", `दिन / ${days}`, 0, 0, 0, "कोई भोजन दर्ज नहीं"));
    } else {
      const diff = rec - ref;
      const step = Math.max(2, Math.round((days * FOOD_LOG_DAYS_CHANGE_PCT) / 100));
      const dir: TrendDirection = diff >= step ? "up" : diff <= -step ? "down" : "stable";
      out.push({
        metric: "food_consistency",
        metricHi: "भोजन दर्ज करने की निरंतरता",
        unit: `दिन / ${days}`,
        isSufficient: true,
        recentValue: rec,
        referenceValue: ref,
        difference: diff,
        percentChange: ref > 0 ? round((diff / ref) * 100, 1) : 0,
        direction: dir,
        directionLabelHi: dir === "up" ? "निरंतरता में सुधार" : dir === "down" ? "निरंतरता में कमी" : "स्थिर",
        confidence: "high",
        confidenceLabelHi: confLabel.high,
        dataPoints: rec,
        explanation: `Food was logged on ${rec} of the last ${days} days (${ref} in the period before).`,
        explanationHi: `पिछले ${days} दिनों में से ${rec} दिन भोजन दर्ज हुआ (उससे पहले के ${days} दिनों में ${ref})।`,
        personalPatternRange: undefined,
        isPersistent: rec >= Math.round(days * 0.7),
        importanceScore: (Math.abs(diff) / step) * 8,
        hasReference: true,
        referencePoints: ref,
      });
    }
  }

  return out;
}

/** Top changes worth showing: sufficient, and either a real change or low adherence. */
export function rankKeyChanges(metrics: MetricHealthChange[], limit = 4): MetricHealthChange[] {
  return metrics
    .filter((m) => m.isSufficient && (m.direction !== "stable" || (m.metric === "medicine_adherence" && m.isPersistent)))
    .sort((a, b) => b.importanceScore - a.importanceScore)
    .slice(0, limit);
}
