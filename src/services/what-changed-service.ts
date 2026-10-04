import { todayIST } from "@/lib/health-rules";
import { buildDoseRecords } from "@/lib/analytics/adherence";
import {
  computeChanges,
  rankKeyChanges,
  type MetricConfidence,
  type MetricHealthChange,
  type TrendDirection,
} from "@/lib/analytics/changes-calc";
import { priorWindow, recentWindow } from "@/lib/analytics/dates";
import { bpDay, foodDay, loadSeries, weightDay } from "./analytics-data";
import { filterValidActivityLogs, filterValidBPLogs, filterValidSleepLogs, filterValidWeightLogs } from "./data-quality-service";
import { getPatientProfile } from "./patient-service";

export type { MetricConfidence, MetricHealthChange, TrendDirection };

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
export function getHealthChanges(patientId?: string, period: "7d" | "30d" = "7d"): Promise<HealthChangesResult> {
  const key = `${patientId ?? ""}|${period}`;
  const pending = _inflight.get(key);
  if (pending) return pending;
  const request = computeHealthChanges(patientId, period).finally(() => {
    _inflight.delete(key);
  });
  _inflight.set(key, request);
  return request;
}

async function computeHealthChanges(patientId: string | undefined, period: "7d" | "30d"): Promise<HealthChangesResult> {
  const profile = await getPatientProfile(patientId);
  const pid = patientId || profile.id;

  const days = period === "7d" ? 7 : 30;
  const today = todayIST();
  const recent = recentWindow(days, today);
  const reference = priorWindow(days, today);

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

  const metrics = computeChanges({
    recent,
    reference,
    steps: activity.map((a) => ({ day: a.date, steps: a.steps })),
    sleep: sleep.map((s) => ({ day: s.date, hours: Number(s.sleep_hours) })),
    bp: bp.map((b) => ({ day: bpDay(b), systolic: b.systolic })),
    weights: weights.map((w) => ({ day: weightDay(w), kg: Number(w.weight_kg) })),
    foodDays: series.food.map(foodDay),
    doses: buildDoseRecords(series.medicines, series.medicineLogs, reference.start, recent.end),
  });

  const sufficient = metrics.filter((m) => m.isSufficient);
  const rankedKeyChanges = rankKeyChanges(metrics);
  const periodHi = period === "7d" ? "सप्ताह" : "महीने";
  const name = profile.name?.trim() || "मरीज़";

  const arrow = (d: TrendDirection) => (d === "up" ? "↑" : d === "down" ? "↓" : "→");
  const word = (d: TrendDirection) => (d === "up" ? "बढ़ोतरी देखी गई" : d === "down" ? "कमी देखी गई" : "स्थिर रहा");

  let compactSummaryHi: string;
  let caregiverSummaryHi: string;
  if (sufficient.length === 0) {
    compactSummaryHi = "तुलना के लिए अभी पर्याप्त डेटा नहीं है। नियमित रिकॉर्डिंग जारी रखें।";
    caregiverSummaryHi = `${name} के स्वास्थ्य में बदलाव देखने के लिए अभी और डेटा दर्ज होना बाकी है।`;
  } else {
    compactSummaryHi = sufficient
      .slice(0, 4)
      .map((m) => `${arrow(m.direction)} ${m.metricHi}: ${word(m.direction)}`)
      .join("\n");
    const changed = rankedKeyChanges.filter((c) => c.metric !== "medicine_adherence");
    const med = metrics.find((m) => m.metric === "medicine_adherence" && m.isSufficient);
    const parts: string[] = [];
    if (changed.length > 0) {
      parts.push(
        `इस ${periodHi} ${name} की ` +
          changed
            .map((c) => `${c.metricHi} ${c.direction === "up" ? "बढ़ी रही" : c.direction === "down" ? "कम रही" : "स्थिर रही"}`)
            .join(", ") +
          "।",
      );
    } else {
      parts.push(`इस ${periodHi} जिन मापों की तुलना हो सकी, उनमें कोई बड़ा बदलाव नहीं दिखा।`);
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
    rankedKeyChanges,
    compactSummary:
      sufficient.length === 0
        ? "Not enough data in the two periods to compare."
        : `Compared ${sufficient.length} of ${metrics.length} measures: last ${days} days vs the ${days} days before.`,
    compactSummaryHi,
    caregiverSummaryHi,
    dataSufficiency: {
      isSufficient: sufficient.length > 0,
      reasonHi: sufficient.length > 0 ? undefined : "तुलना के लिए दोनों अवधियों में पर्याप्त रिकॉर्ड नहीं हैं।",
      totalRecordsEvaluated: totalRecords,
    },
  };
}
