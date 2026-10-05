import { eachIST, isPlausibleBP, todayIST } from "@/lib/health-rules";
import { buildDoseRecords, summarizeAdherence } from "@/lib/analytics/adherence";
import {
  computeChanges,
  rankKeyChanges,
  type MetricConfidence,
  type MetricHealthChange,
  type TrendDirection,
} from "@/lib/analytics/changes-calc";
import { priorWindow, recentWindow, type DateWindow } from "@/lib/analytics/dates";
import { bpDay, foodDay, loadSeries, weightDay } from "./analytics-data";
import { filterValidActivityLogs, filterValidBPLogs, filterValidSleepLogs, filterValidWeightLogs } from "./data-quality-service";
import { getPatientProfile } from "./patient-service";

export type { MetricConfidence, MetricHealthChange, TrendDirection };

/** One IST day of a metric's daily series; `value` is null when nothing was recorded that day. */
export interface ChangeSeriesPoint {
  date: string;
  value: number | null;
}

/** The two compared windows of one metric, day by day, so the page can chart them. */
export interface ChangeSeries {
  recent: ChangeSeriesPoint[];
  reference: ChangeSeriesPoint[];
  /** What one point is: a day's total, a day's mean, a day's last reading, or a day's percentage. */
  kind: "steps" | "sleep" | "systolic" | "weight" | "calories" | "adherence";
}

export interface HealthChangesResult {
  patientId: string;
  period: "7d" | "30d";
  analyzedAt: string;
  /** IST dates (inclusive): the recent window and the equal-length window just before it. */
  dateRange: {
    recentStart: string;
    recentEnd: string;
    referenceStart: string;
    referenceEnd: string;
  };
  metrics: MetricHealthChange[];
  /** Day-by-day values behind each metric (keyed like `metrics[].metric`), recent and earlier window. */
  series: Record<string, ChangeSeries>;
  /** True when the recent window ends today (not a past window the reader navigated to). */
  isLatest: boolean;
  rankedKeyChanges: MetricHealthChange[];
  compactSummary: string;
  compactSummaryHi: string;
  caregiverSummaryHi: string;
  dataSufficiency: {
    isSufficient: boolean;
    reasonHi?: string;
    totalRecordsEvaluated: number;
  };
}

const _inflight = new Map<string, Promise<HealthChangesResult>>();

/**
 * Recent window vs the window just before it (medians, IST calendar days).
 * Never compares against a baseline that already contains the recent days.
 */
export function getHealthChanges(
  patientId?: string,
  period: "7d" | "30d" = "7d",
  /** Last IST day of the recent window (default today); lets the reader step back through earlier periods. */
  endDate?: string,
): Promise<HealthChangesResult> {
  const key = `${patientId ?? ""}|${period}|${endDate ?? ""}`;
  const pending = _inflight.get(key);
  if (pending) return pending;
  const request = computeHealthChanges(patientId, period, endDate).finally(() => {
    _inflight.delete(key);
  });
  _inflight.set(key, request);
  return request;
}

async function computeHealthChanges(
  patientId: string | undefined,
  period: "7d" | "30d",
  endDate: string | undefined,
): Promise<HealthChangesResult> {
  const profile = await getPatientProfile(patientId);
  const pid = patientId || profile.id;

  const days = period === "7d" ? 7 : 30;
  const today = todayIST();
  const end = endDate && endDate < today ? endDate : today;
  const recent = recentWindow(days, end);
  const reference = priorWindow(days, end);

  const series = await loadSeries(pid, reference.start, recent.end, [
    "bp",
    "weight",
    "food",
    "sleep",
    "activity",
    "medicineLogs",
    "medicines",
  ]);

  const bp = filterValidBPLogs(series.bp);
  const weights = filterValidWeightLogs(series.weight);
  const sleep = filterValidSleepLogs(series.sleep);
  const activity = filterValidActivityLogs(series.activity);

  const totalRecords = bp.length + weights.length + sleep.length + activity.length + series.food.length;

  const doses = buildDoseRecords(series.medicines, series.medicineLogs, reference.start, recent.end);
  const metrics = computeChanges({
    recent,
    reference,
    steps: activity.map((a) => ({ day: a.date, steps: a.steps })),
    sleep: sleep.map((s) => ({ day: s.date, hours: Number(s.sleep_hours) })),
    bp: bp.map((b) => ({ day: bpDay(b), systolic: b.systolic })),
    weights: weights.map((w) => ({ day: weightDay(w), kg: Number(w.weight_kg) })),
    foodDays: series.food.map(foodDay),
    doses,
  });

  // Day-by-day values behind the medians, for the charts. Same filters as above.
  const daily = (win: DateWindow, pick: (day: string) => number | null): ChangeSeriesPoint[] =>
    eachIST(win.start, win.end).map((date) => ({ date, value: pick(date) }));
  const lastOf = <T,>(rows: T[], day: (r: T) => string, value: (r: T) => number) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(day(r), value(r));
    return m;
  };
  const stepsByDay = lastOf(activity.filter((a) => a.steps > 0), (a) => a.date, (a) => a.steps);
  const sleepByDay = lastOf(sleep.filter((x) => Number(x.sleep_hours) > 0), (x) => x.date, (x) => Number(x.sleep_hours));
  const weightByDay = lastOf(weights, weightDay, (w) => Number(w.weight_kg));
  const sysByDay = new Map<string, number[]>();
  for (const b of bp) {
    if (!isPlausibleBP(b.systolic, b.diastolic)) continue;
    const list = sysByDay.get(bpDay(b));
    if (list) list.push(b.systolic);
    else sysByDay.set(bpDay(b), [b.systolic]);
  }
  const kcalByDay = new Map<string, number>();
  for (const f of series.food) kcalByDay.set(foodDay(f), (kcalByDay.get(foodDay(f)) ?? 0) + Number(f.calories || 0));
  const dosesByDay = new Map<string, typeof doses>();
  for (const dose of doses) {
    const list = dosesByDay.get(dose.date);
    if (list) list.push(dose);
    else dosesByDay.set(dose.date, [dose]);
  }
  const adherenceOn = (date: string) => summarizeAdherence(dosesByDay.get(date) ?? []).pct;
  const meanOf = (xs: number[] | undefined) => (xs && xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const twoWindows = (kind: ChangeSeries["kind"], pick: (day: string) => number | null): ChangeSeries => ({
    kind,
    recent: daily(recent, pick),
    reference: daily(reference, pick),
  });
  const chartSeries: Record<string, ChangeSeries> = {
    daily_steps: twoWindows("steps", (d) => stepsByDay.get(d) ?? null),
    sleep_duration: twoWindows("sleep", (d) => sleepByDay.get(d) ?? null),
    systolic_bp: twoWindows("systolic", (d) => meanOf(sysByDay.get(d))),
    body_weight: twoWindows("weight", (d) => weightByDay.get(d) ?? null),
    food_consistency: twoWindows("calories", (d) => (kcalByDay.has(d) ? Math.round(kcalByDay.get(d) as number) : null)),
    medicine_adherence: twoWindows("adherence", adherenceOn),
  };

  const sufficient = metrics.filter((m) => m.isSufficient);
  const rankedKeyChanges = rankKeyChanges(metrics);
  const periodHi = period === "7d" ? "सप्ताह" : "महीने";
  const thisHi = recent.end === today ? "इस" : "उस";
  const name = profile.name?.trim() || "मरीज़";

  const arrow = (d: TrendDirection) => (d === "up" ? "↑" : d === "down" ? "↓" : "→");
  const word = (d: TrendDirection) => (d === "up" ? "बढ़ोतरी देखी गई" : d === "down" ? "कमी देखी गई" : "स्थिर रहा");

  let compactSummaryHi: string;
  let caregiverSummaryHi: string;
  if (sufficient.length === 0) {
    compactSummaryHi = "तुलना के लिए अभी पर्याप्त डेटा नहीं है। नियमित रिकॉर्डिंग जारी रखें।";
    caregiverSummaryHi = `${name} के स्वास्थ्य में बदलाव देखने के लिए अभी और डेटा दर्ज होना बाकी है।`;
  } else {
    // Only measures that really have an earlier period to be compared with, biggest change first.
    const comparable = sufficient.filter((m) => m.hasReference).sort((a, b) => b.importanceScore - a.importanceScore);
    compactSummaryHi =
      comparable.length === 0
        ? "पिछली अवधि का रिकॉर्ड न होने से अभी तुलना नहीं हो सकी।"
        : comparable
            .slice(0, 4)
            .map((m) => `${arrow(m.direction)} ${m.metricHi}: ${word(m.direction)}`)
            .join("\n");
    const changed = rankedKeyChanges.filter((c) => c.metric !== "medicine_adherence");
    const med = metrics.find((m) => m.metric === "medicine_adherence" && m.isSufficient);
    const parts: string[] = [];
    if (changed.length > 0) {
      parts.push(
        `${thisHi} ${periodHi} ${name} की ` +
          changed
            .map((c) => `${c.metricHi} ${c.direction === "up" ? "बढ़ी रही" : c.direction === "down" ? "कम रही" : "स्थिर रही"}`)
            .join(", ") +
          "।",
      );
    } else {
      parts.push(`${thisHi} ${periodHi} जिन मापों की तुलना हो सकी, उनमें कोई बड़ा बदलाव नहीं दिखा।`);
    }
    if (med) parts.push(med.explanationHi);
    caregiverSummaryHi = parts.join(" ");
  }

  return {
    patientId: pid,
    period,
    analyzedAt: new Date().toISOString(),
    dateRange: {
      recentStart: recent.start,
      recentEnd: recent.end,
      referenceStart: reference.start,
      referenceEnd: reference.end,
    },
    metrics,
    series: chartSeries,
    isLatest: recent.end === today,
    rankedKeyChanges,
    compactSummary:
      sufficient.length === 0
        ? "Not enough data in the two periods to compare."
        : `Compared ${sufficient.length} of ${metrics.length} measures: ${recent.end === today ? "the last" : "the"} ${days} days${recent.end === today ? "" : ` ending ${recent.end}`} vs the ${days} days before.`,
    compactSummaryHi,
    caregiverSummaryHi,
    dataSufficiency: {
      isSufficient: sufficient.length > 0,
      reasonHi: sufficient.length > 0 ? undefined : "तुलना के लिए दोनों अवधियों में पर्याप्त रिकॉर्ड नहीं हैं।",
      totalRecordsEvaluated: totalRecords,
    },
  };
}
