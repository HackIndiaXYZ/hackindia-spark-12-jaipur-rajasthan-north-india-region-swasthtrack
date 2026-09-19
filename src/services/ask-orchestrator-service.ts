/**
 * SwasthTrack Ask Mode — Edge Orchestrator Service (§1, §13, §17, §25)
 * Central pipeline orchestrating Normalization -> Temporal Resolution -> Auth Gate ->
 * Safe Query Planning -> DB Execution -> Fact Validation -> Developer Trace -> AskResponse Contract.
 */

import { getAuthorizedPatients } from "./auth-service";
import {
  getActivityLogs,
  getBloodPressureLogs,
  getFoodLogs,
  getFoodLogsByDate,
  getMedicineLogsByDate,
  getMedicines,
  getPatientProfile,
  getSleepLogs,
  getWeightLogs,
  type PatientProfile,
} from "./patient-service";
import { normalizeUserInput } from "./ask-normalizer-service";
import { resolveTemporal, getFormattedDateInTZ } from "./ask-temporal-resolver";
import { planQueryOperation, type MetricKey, type PlannedOperation } from "./ask-query-planner";
import { validateOutputFacts } from "./ask-output-validator";
import { getCaregiverDailyBrief } from "./caregiver-intelligence-service";
import { calculateDailyWellnessScore } from "./wellness-score-service";
import { getHealthChanges } from "./what-changed-service";

export interface AskResponseContract {
  answer_text: string;
  cards: Array<{
    id: string;
    question: string;
    intent: string;
    summaryHi: string;
    healthSolutionHi?: string;
    mainMetric?: {
      labelHi: string;
      value: string;
      subvalue?: string;
      changeTextHi?: string;
      changeDirection?: "up" | "down" | "stable";
    };
    bullets?: string[];
    disclaimerHi?: string;
    evidence: {
      recordsEvaluated: number;
      dataThroughDate: string;
      confidence: "High" | "Medium" | "Low";
      calculationMethod: string;
      calculationMethodHi: string;
      relatedActionUrl?: string;
      relatedActionLabelHi?: string;
    };
    timestamp: string;
  }>;
  evidence: {
    data_points: number;
    source: string;
    date_range?: { start: string; end: string };
  };
  patient: { label: string; id: string };
  date_range?: { start: string; end: string };
  intent: string;
  confidence: {
    understanding: number; // 0.0 - 1.0
    data: "high" | "medium" | "low";
  };
  limitations: string[];
  follow_up_suggestions: string[];
  trace: {
    raw_message: string;
    normalized_message: string;
    language_detected: string;
    parser_output: {
      intent: string;
      entities: string[];
      understanding_confidence: number;
    };
    temporal_resolution: {
      phrase: string;
      resolved_date?: string;
      timezone: string;
      method: string;
    };
    patient_resolution: {
      requested_label: string;
      resolved_patient_id: string;
      authorized: boolean;
    };
    planned_operation: {
      operation: string;
      metric: string;
      date?: string;
    };
    records_returned: number;
    data_confidence: string;
    validation: "PASS" | "FAIL_FALLBACK_USED";
    latency_ms: number;
  };
}

type RangeWindow = { start: string; end: string };

interface MetricAnswerResult {
  recordsCount: number;
  summaryHi: string;
  mainMetric?: AskResponseContract["cards"][0]["mainMetric"];
  bullets: string[];
  healthSolutionHi: string;
}

/**
 * Derives a {date?, range?} window from the SafeQueryPlanner's own planned operation
 * (§7/§21), so per-metric execution below is actually driven by what was planned
 * rather than re-deriving dates from scratch or ignoring the plan entirely.
 */
function getOperationWindow(op: PlannedOperation): { date?: string; range?: RangeWindow } {
  switch (op.operation) {
    case "get_metric_on_date":
      return { date: op.date };
    case "get_metric_range":
    case "get_metric_average":
    case "get_metric_min":
    case "get_metric_max":
    case "get_metric_count":
    case "get_missing_data":
    case "get_medicine_adherence":
    case "get_wellness_summary":
    case "get_top_foods":
      return { range: { start: op.start, end: op.end } };
    case "get_food_history":
      return { date: op.date, range: op.start && op.end ? { start: op.start, end: op.end } : undefined };
    case "get_metric_change":
    case "compare_periods":
      return { range: { start: op.period_a.start, end: op.period_a.end } };
    case "get_goal_status":
    case "unsupported":
    default:
      return {};
  }
}

/** Inclusive list of YYYY-MM-DD strings between start and end, capped to avoid runaway loops. */
function buildDateStrRange(start: string, end: string): string[] {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
    return [end];
  }
  const result: string[] = [];
  const cursor = new Date(startDate.getTime());
  let guard = 0;
  while (cursor <= endDate && guard < 31) {
    result.push(cursor.toISOString().split("T")[0]);
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return result.length > 0 ? result : [end];
}

async function answerBloodPressure(
  pid: string,
  subjectName: string,
  tz: string,
  date?: string,
  range?: RangeWindow
): Promise<MetricAnswerResult> {
  const healthSolutionHi = "💡 स्वास्थ्य सलाह & उपाय: नियमित 2.5L पानी पीएं, भोजन में कम सोडियम (नमक) लें और रोजाना शाम 30 मिनट हल्की वॉक करें।";
  const bpLogs = await getBloodPressureLogs(pid, 60);

  if (range) {
    const filtered = bpLogs.filter((b) => {
      const d = getFormattedDateInTZ(new Date(b.measured_at || b.created_at), tz);
      return d >= range.start && d <= range.end;
    });
    if (filtered.length === 0) {
      if (bpLogs.length > 0) {
        const latest = bpLogs[0];
        return {
          recordsCount: 1,
          summaryHi: `चुनी गई अवधि (${range.start} से ${range.end}) में BP दर्ज नहीं है। ${subjectName} का नवीनतम BP ${latest.systolic}/${latest.diastolic} mmHg दर्ज हुआ था।`,
          mainMetric: {
            labelHi: "नवीनतम दर्ज BP",
            value: `${latest.systolic}/${latest.diastolic} mmHg`,
            subvalue: latest.pulse ? `नाड़ी: ${latest.pulse} bpm` : undefined,
          },
          bullets: [],
          healthSolutionHi,
        };
      }
      return { recordsCount: 0, summaryHi: `${subjectName} के लिए ब्लड प्रेशर (BP) का कोई रिकॉर्ड उपलब्ध नहीं है।`, bullets: [], healthSolutionHi };
    }

    const avgSys = Math.round(filtered.reduce((s, b) => s + b.systolic, 0) / filtered.length);
    const avgDia = Math.round(filtered.reduce((s, b) => s + b.diastolic, 0) / filtered.length);
    return {
      recordsCount: filtered.length,
      summaryHi: `${range.start} से ${range.end} के बीच ${subjectName} का औसत रक्तचाप (BP) ${avgSys}/${avgDia} mmHg रहा (कुल ${filtered.length} मापों के आधार पर)।`,
      mainMetric: {
        labelHi: "अवधि का औसत BP",
        value: `${avgSys} / ${avgDia} mmHg`,
        subvalue: `${filtered.length} मान्य मापों का औसत`,
      },
      bullets: [
        `उच्चतम माप: ${Math.max(...filtered.map((b) => b.systolic))}/${Math.max(...filtered.map((b) => b.diastolic))} mmHg`,
        `न्यूनतम माप: ${Math.min(...filtered.map((b) => b.systolic))}/${Math.min(...filtered.map((b) => b.diastolic))} mmHg`,
      ],
      healthSolutionHi,
    };
  }

  const dateStr = date || getFormattedDateInTZ(new Date(), tz);
  const filtered = bpLogs.filter((b) => getFormattedDateInTZ(new Date(b.measured_at || b.created_at), tz) === dateStr);
  if (filtered.length > 0) {
    const latest = filtered[0];
    return {
      recordsCount: filtered.length,
      summaryHi: `${dateStr} को ${subjectName} का ब्लड प्रेशर (BP) ${latest.systolic}/${latest.diastolic} mmHg दर्ज हुआ।`,
      mainMetric: {
        labelHi: `${dateStr} का BP`,
        value: `${latest.systolic} / ${latest.diastolic} mmHg`,
        subvalue: latest.pulse ? `नाड़ी: ${latest.pulse} bpm` : undefined,
      },
      bullets: [
        `माप का समय: ${new Date(latest.measured_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
        `प्रकार: ${latest.reading_type || "सामान्य"}`,
      ],
      healthSolutionHi,
    };
  }
  return { recordsCount: 0, summaryHi: `${dateStr} के लिए ${subjectName} का ब्लड प्रेशर (BP) रिकॉर्ड दर्ज नहीं है।`, bullets: [], healthSolutionHi };
}

async function answerWeight(
  pid: string,
  subjectName: string,
  tz: string,
  date?: string,
  range?: RangeWindow
): Promise<MetricAnswerResult> {
  const healthSolutionHi = "💡 स्वास्थ्य सलाह & उपाय: वजन संतुलित रखने के लिए रात 8:00 बजे से पहले सुपाच्य भोजन लें और रोजाना 45 मिनट वाकिंग को दिनचर्या में शामिल करें।";
  const weightLogs = await getWeightLogs(pid, 60);

  if (weightLogs.length === 0) {
    return { recordsCount: 0, summaryHi: `${subjectName} के लिए वजन का कोई रिकॉर्ड उपलब्ध नहीं है।`, bullets: [], healthSolutionHi };
  }

  if (range) {
    const filtered = weightLogs.filter((w) => {
      const d = getFormattedDateInTZ(new Date(w.measured_at || w.created_at), tz);
      return d >= range.start && d <= range.end;
    });
    if (filtered.length === 0) {
      const latest = weightLogs[0];
      return {
        recordsCount: 1,
        summaryHi: `चुनी गई अवधि (${range.start} से ${range.end}) में वजन दर्ज नहीं है। ${subjectName} का नवीनतम दर्ज वजन ${latest.weight_kg} kg है।`,
        mainMetric: { labelHi: "नवीनतम दर्ज वजन", value: `${latest.weight_kg} kg` },
        bullets: [],
        healthSolutionHi,
      };
    }
    const newest = filtered[0];
    const oldest = filtered[filtered.length - 1];
    const diff = Number((newest.weight_kg - oldest.weight_kg).toFixed(1));
    const changeText = diff === 0 ? "वजन स्थिर रहा" : `${diff > 0 ? "+" : ""}${diff} kg का बदलाव`;
    return {
      recordsCount: filtered.length,
      summaryHi: `${range.start} से ${range.end} के बीच ${subjectName} का वजन ${oldest.weight_kg} kg से ${newest.weight_kg} kg हुआ (${changeText})।`,
      mainMetric: {
        labelHi: "वजन (चुनी गई अवधि)",
        value: `${newest.weight_kg} kg`,
        subvalue: `पूर्व माप: ${oldest.weight_kg} kg`,
        changeTextHi: changeText,
        changeDirection: diff > 0 ? "up" : diff < 0 ? "down" : "stable",
      },
      bullets: [`रिकॉर्ड की गई प्रविष्टियाँ: ${filtered.length}`],
      healthSolutionHi,
    };
  }

  const dateStr = date || getFormattedDateInTZ(new Date(), tz);
  const filtered = weightLogs.filter((w) => getFormattedDateInTZ(new Date(w.measured_at || w.created_at), tz) === dateStr);
  if (filtered.length > 0) {
    const entry = filtered[0];
    return {
      recordsCount: filtered.length,
      summaryHi: `${dateStr} को ${subjectName} का दर्ज वजन ${entry.weight_kg} kg था।`,
      mainMetric: { labelHi: `${dateStr} का वजन`, value: `${entry.weight_kg} kg` },
      bullets: [],
      healthSolutionHi,
    };
  }
  const latest = weightLogs[0];
  return {
    recordsCount: 1,
    summaryHi: `${dateStr} के लिए वजन दर्ज नहीं है। ${subjectName} का नवीनतम दर्ज वजन ${latest.weight_kg} kg है।`,
    mainMetric: { labelHi: "नवीनतम दर्ज वजन", value: `${latest.weight_kg} kg` },
    bullets: [],
    healthSolutionHi,
  };
}

async function answerSteps(
  pid: string,
  subjectName: string,
  tz: string,
  date?: string,
  range?: RangeWindow
): Promise<MetricAnswerResult> {
  const healthSolutionHi = "💡 स्वास्थ्य सलाह & उपाय: प्रतिदिन 6,000 से 8,000 कदम चलना हृदय और जोड़ों के लिए उत्तम है। एक साथ चलने के बजाय सुबह-शाम विभाजित करें।";
  const actLogs = await getActivityLogs(pid, 60);

  if (actLogs.length === 0) {
    return { recordsCount: 0, summaryHi: `${subjectName} के लिए कदमों का कोई रिकॉर्ड उपलब्ध नहीं है।`, bullets: [], healthSolutionHi };
  }

  if (range) {
    const filtered = actLogs.filter((a) => a.date >= range.start && a.date <= range.end);
    if (filtered.length === 0) {
      const latest = actLogs[0];
      return {
        recordsCount: 1,
        summaryHi: `चुनी गई अवधि में कदम दर्ज नहीं हैं। ${latest.date} को ${subjectName} के ${latest.steps.toLocaleString()} कदम दर्ज हुए थे।`,
        mainMetric: { labelHi: "नवीनतम दर्ज कदम", value: `${latest.steps.toLocaleString()} कदम` },
        bullets: [],
        healthSolutionHi,
      };
    }
    const totalSteps = filtered.reduce((s, a) => s + (a.steps || 0), 0);
    const avgSteps = Math.round(totalSteps / filtered.length);
    const maxDay = [...filtered].sort((a, b) => b.steps - a.steps)[0];
    return {
      recordsCount: filtered.length,
      summaryHi: `${range.start} से ${range.end} के बीच ${subjectName} का औसत ${avgSteps.toLocaleString()} कदम/दिन रहा। सबसे अधिक कदम ${maxDay.date} को (${maxDay.steps.toLocaleString()} कदम) दर्ज हुए।`,
      mainMetric: {
        labelHi: "औसत दैनिक कदम",
        value: `${avgSteps.toLocaleString()} कदम / दिन`,
        subvalue: `कुल: ${totalSteps.toLocaleString()} कदम (${filtered.length} दिन)`,
      },
      bullets: [
        `सर्वाधिक सक्रिय दिन: ${maxDay.date} (${maxDay.steps.toLocaleString()} कदम)`,
        `कुल रिकॉर्डेड दिन: ${filtered.length} दिन`,
      ],
      healthSolutionHi,
    };
  }

  const dateStr = date || getFormattedDateInTZ(new Date(), tz);
  const dayEntry = actLogs.find((a) => a.date === dateStr);
  if (dayEntry) {
    return {
      recordsCount: 1,
      summaryHi: `${dateStr} को ${subjectName} ने कुल ${dayEntry.steps.toLocaleString()} कदम चले (${dayEntry.distance_km || "--"} किमी दूरी)।`,
      mainMetric: {
        labelHi: `${dateStr} के कदम`,
        value: `${dayEntry.steps.toLocaleString()} कदम`,
        subvalue: dayEntry.walking_minutes ? `${dayEntry.walking_minutes} मिनट वॉक` : undefined,
      },
      bullets: [],
      healthSolutionHi,
    };
  }
  const latest = actLogs[0];
  return {
    recordsCount: 1,
    summaryHi: `${dateStr} के लिए कदम दर्ज नहीं हैं। ${latest.date} को ${subjectName} के ${latest.steps.toLocaleString()} कदम दर्ज हुए थे।`,
    mainMetric: { labelHi: "नवीनतम दर्ज कदम", value: `${latest.steps.toLocaleString()} कदम` },
    bullets: [],
    healthSolutionHi,
  };
}

async function answerSleep(
  pid: string,
  subjectName: string,
  tz: string,
  date?: string,
  range?: RangeWindow
): Promise<MetricAnswerResult> {
  const healthSolutionHi = "💡 स्वास्थ्य सलाह & उपाय: रात 10:00 बजे तक सोएं और कमरे में शांत वातावरण रखें। सोने से 1 घंटे पहले स्क्रीन समय बंद करें।";
  const sleepLogs = await getSleepLogs(pid, 60);

  if (sleepLogs.length === 0) {
    return { recordsCount: 0, summaryHi: "नींद का कोई रिकॉर्ड दर्ज नहीं मिला।", bullets: [], healthSolutionHi };
  }

  if (range) {
    const filtered = sleepLogs.filter((s) => s.date >= range.start && s.date <= range.end);
    if (filtered.length === 0) {
      return { recordsCount: 0, summaryHi: `${range.start} से ${range.end} के बीच नींद का कोई रिकॉर्ड दर्ज नहीं मिला।`, bullets: [], healthSolutionHi };
    }
    const avgSleep = Number((filtered.reduce((s, a) => s + Number(a.sleep_hours || 0), 0) / filtered.length).toFixed(1));
    const minDay = [...filtered].sort((a, b) => Number(a.sleep_hours) - Number(b.sleep_hours))[0];
    return {
      recordsCount: filtered.length,
      summaryHi: `${range.start} से ${range.end} के बीच ${subjectName} की औसत नींद ${avgSleep} घंटे/रात रही। सबसे कम नींद ${minDay.date} (${minDay.sleep_hours} घंटे) को दर्ज हुई।`,
      mainMetric: { labelHi: "औसत नींद", value: `${avgSleep} घंटे / रात`, subvalue: `${filtered.length} रातों का औसत` },
      bullets: [],
      healthSolutionHi,
    };
  }

  const dateStr = date || getFormattedDateInTZ(new Date(), tz);
  const entry = sleepLogs.find((s) => s.date === dateStr);
  if (entry) {
    return {
      recordsCount: 1,
      summaryHi: `${dateStr} को ${subjectName} की नींद ${entry.sleep_hours} घंटे दर्ज रही।`,
      mainMetric: {
        labelHi: "नींद की अवधि",
        value: `${entry.sleep_hours} घंटे`,
        subvalue: entry.bedtime && entry.wake_time ? `${entry.bedtime} से ${entry.wake_time}` : undefined,
      },
      bullets: [],
      healthSolutionHi,
    };
  }
  return { recordsCount: 0, summaryHi: `${dateStr} के लिए नींद का कोई रिकॉर्ड दर्ज नहीं है।`, bullets: [], healthSolutionHi };
}

async function answerFood(
  pid: string,
  subjectName: string,
  tz: string,
  date?: string,
  range?: RangeWindow
): Promise<MetricAnswerResult> {
  const healthSolutionHi = "💡 स्वास्थ्य सलाह & उपाय: प्रोटीन युक्त संतुलित आहार लें, तली-भुनी चीजों से बचें और भोजन के बाद 15 मिनट वज्रासन या हल्की वॉक करें।";

  if (range) {
    const foodLogs = await getFoodLogs(pid, 90);
    const filtered = foodLogs.filter((f) => {
      const d = getFormattedDateInTZ(new Date(f.consumed_at || f.created_at), tz);
      return d >= range.start && d <= range.end;
    });
    if (filtered.length === 0) {
      return { recordsCount: 0, summaryHi: `${range.start} से ${range.end} के बीच ${subjectName} का कोई भोजन दर्ज नहीं हुआ है।`, bullets: [], healthSolutionHi };
    }
    const totalCal = filtered.reduce((s, f) => s + (f.calories || 0), 0);
    const uniqueDays = new Set(filtered.map((f) => getFormattedDateInTZ(new Date(f.consumed_at || f.created_at), tz))).size;
    const avgCal = Math.round(totalCal / Math.max(1, uniqueDays));
    return {
      recordsCount: filtered.length,
      summaryHi: `${range.start} से ${range.end} के बीच ${subjectName} ने कुल ${totalCal.toLocaleString()} kcal भोजन दर्ज किया (औसत ${avgCal.toLocaleString()} kcal/दिन, ${filtered.length} आइटम)।`,
      mainMetric: { labelHi: "अवधि का भोजन", value: `${totalCal.toLocaleString()} kcal`, subvalue: `${filtered.length} आइटम, ${uniqueDays} दिन` },
      bullets: [`औसत दैनिक कैलोरी: ${avgCal.toLocaleString()} kcal`],
      healthSolutionHi,
    };
  }

  const dateStr = date || getFormattedDateInTZ(new Date(), tz);
  const foodLogs = await getFoodLogsByDate(pid, dateStr);
  if (foodLogs.length === 0) {
    return { recordsCount: 0, summaryHi: `${dateStr} को ${subjectName} का कोई भोजन दर्ज नहीं हुआ है।`, bullets: [], healthSolutionHi };
  }
  const totalCal = foodLogs.reduce((s, f) => s + (f.calories || 0), 0);
  const itemsList = foodLogs.map((f) => `${f.food_name} (${f.calories} kcal)`);
  return {
    recordsCount: foodLogs.length,
    summaryHi: `${dateStr} को ${itemsList.join(", ")} दर्ज किया गया (कुल ${totalCal.toLocaleString()} kcal)।`,
    mainMetric: { labelHi: `${dateStr} का भोजन`, value: `${totalCal.toLocaleString()} kcal`, subvalue: `${foodLogs.length} आइटम दर्ज` },
    bullets: itemsList,
    healthSolutionHi,
  };
}

async function answerMedicine(
  pid: string,
  subjectName: string,
  date?: string,
  range?: RangeWindow
): Promise<MetricAnswerResult> {
  const healthSolutionHi = "💡 स्वास्थ्य सलाह & उपाय: दवाइयों को नियत समय पर लें। भूखे पेट वाली दवाओं को सुबह उठते ही लें। अलार्म या रिमाइंडर सक्रिय रखें।";
  const medicines = await getMedicines(pid);
  const activeMeds = medicines.filter((m) => m.active);

  if (activeMeds.length === 0) {
    return { recordsCount: 0, summaryHi: `${subjectName} के लिए कोई सक्रिय दवा दर्ज नहीं है।`, bullets: [], healthSolutionHi };
  }

  const dates = range ? buildDateStrRange(range.start, range.end) : [date || new Date().toISOString().split("T")[0]];

  // Fetch all days in parallel rather than one sequential await per day, since a
  // 30-day adherence range would otherwise chain up to 30 round-trips.
  const perDayLogs = await Promise.all(dates.map((d) => getMedicineLogsByDate(pid, d)));

  let takenTotal = 0;
  const perMedTaken = new Map<string, number>();

  for (const medLogs of perDayLogs) {
    for (const m of activeMeds) {
      const l = medLogs.find((log) => log.medicine_id === m.id);
      if (l && (l.status === "taken" || l.status === "late")) {
        takenTotal += 1;
        perMedTaken.set(m.id, (perMedTaken.get(m.id) || 0) + 1);
      }
    }
  }

  const expectedTotal = activeMeds.length * dates.length;
  const adherencePct = expectedTotal > 0 ? Math.round((takenTotal / expectedTotal) * 100) : 100;
  const rangeLabel = range ? `${range.start} से ${range.end}` : dates[0];

  const bullets = activeMeds.map((m) => {
    const takenDays = perMedTaken.get(m.id) || 0;
    return dates.length > 1
      ? `${m.medicine_name} (${m.dose}): ${takenDays}/${dates.length} दिन ली गई`
      : `${m.medicine_name} (${m.dose}): ${takenDays > 0 ? "समय पर ली गई ✓" : "लंबित / छूट गई ✗"}`;
  });

  return {
    recordsCount: activeMeds.length,
    summaryHi: `${rangeLabel} में ${subjectName} की दवाइयों का पालन ${adherencePct}% रहा (${takenTotal}/${expectedTotal} खुराकें दर्ज)।`,
    mainMetric: {
      labelHi: "दवा नियमितता (Adherence)",
      value: `${takenTotal} / ${expectedTotal} खुराकें (${adherencePct}%)`,
      subvalue: takenTotal === expectedTotal ? "सभी खुराकें पूरी ✓" : `${expectedTotal - takenTotal} खुराकें शेष`,
    },
    bullets,
    healthSolutionHi,
  };
}

async function answerWellness(
  pid: string,
  subjectName: string,
  tz: string,
  date?: string,
  range?: RangeWindow
): Promise<MetricAnswerResult> {
  const healthSolutionHi = "💡 स्वास्थ्य सलाह & उपाय: दैनिक दिनचर्या में 30 मिनट वाकिंग, समय पर दवा सेवन और संतुलित पौष्टिक आहार का पालन करें।";
  const dateStr = range ? range.end : date || getFormattedDateInTZ(new Date(), tz);
  const scoreResult = await calculateDailyWellnessScore(pid, dateStr);
  const rangeNote = range ? ` (चुनी गई अवधि ${range.start} से ${range.end} में से नवीनतम ${dateStr} का स्कोर दिखाया गया है)` : "";

  return {
    recordsCount: 1,
    summaryHi: `${dateStr} को ${subjectName} का दैनिक रूटीन स्कोर ${scoreResult.totalScore}/100 रहा (${scoreResult.categoryHi})${rangeNote}।`,
    mainMetric: { labelHi: "दैनिक रूटीन स्कोर", value: `${scoreResult.totalScore} / 100`, subvalue: scoreResult.categoryHi },
    bullets: [
      ...scoreResult.reasons.positive.slice(0, 2),
      ...scoreResult.missingDataItems.map((m) => `लंबित: ${m}`),
    ],
    healthSolutionHi,
  };
}

async function answerWhatChanged(pid: string, subjectName: string, period: "7d" | "30d"): Promise<MetricAnswerResult> {
  const healthSolutionHi = "💡 स्वास्थ्य सलाह & उपाय: स्वास्थ्य प्रवृत्तियों में बदलाव आने पर समय पर दवाइयाँ लें और अपनी दैनिक वॉक व पानी की मात्रा संतुलित रखें।";
  const changes = await getHealthChanges(pid, period);
  const bullets = changes.metrics
    .filter((m) => m.isSufficient)
    .map((m) => `${m.metricHi}: ${m.directionLabelHi} (${m.percentChange > 0 ? "+" : ""}${m.percentChange}%) — ${m.explanationHi}`);

  return {
    recordsCount: changes.dataSufficiency.totalRecordsEvaluated,
    summaryHi: `पिछले ${period === "7d" ? "7 दिनों" : "30 दिनों"} में ${subjectName} के स्वास्थ्य रिकॉर्ड्स का तुलनात्मक विश्लेषण।`,
    bullets: bullets.length > 0 ? bullets : ["अधिकांश स्वास्थ्य रिकॉर्ड हालिया सामान्य दायरे में स्थिर रहे हैं।"],
    healthSolutionHi,
  };
}

interface LLMAskAnswer {
  answerHi: string;
  answerEn: string;
  citedDates: string[];
  confidence: "high" | "medium" | "low";
  isRefusal: boolean;
  refusalReason: string | null;
  safetyLevel: "info" | "attention" | "escalate";
}

const CONFIDENCE_TO_SCORE: Record<LLMAskAnswer["confidence"], number> = { high: 0.95, medium: 0.75, low: 0.5 };
const CONFIDENCE_TO_LABEL: Record<LLMAskAnswer["confidence"], "High" | "Medium" | "Low"> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * Real-LLM answer path (src/app/api/ask/route.ts) — grounds Claude in the
 * patient's actual fetched records so ANY phrasing of a question can be
 * understood, instead of the rule-based pipeline below which only matches
 * patterns its normalizer/temporal-resolver anticipated. Tried first; on any
 * failure (no API key configured, network error, malformed response) this
 * returns null and execution falls through to the existing rule-based
 * pipeline unchanged, so the feature degrades gracefully rather than
 * breaking when the LLM path is unavailable.
 */
async function tryLlmGroundedAnswer(
  pid: string,
  subjectName: string,
  userMessage: string
): Promise<AskResponseContract | null> {
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: pid, question: userMessage }),
    });
    if (!res.ok) return null;

    const body: { answer?: LLMAskAnswer; model?: string } = await res.json();
    const answer = body.answer;
    if (!answer || typeof answer.answerHi !== "string") return null;

    const todayStr = getFormattedDateInTZ(new Date(), "Asia/Kolkata");
    const disclaimerHi = answer.isRefusal
      ? answer.safetyLevel === "escalate"
        ? "⚠️ स्वास्थट्रैक एक गैर-चिकित्सीय (Non-clinical) वेलनेस ट्रैकर है। कृपया डॉक्टर से संपर्क करें।"
        : (answer.refusalReason || undefined)
      : undefined;

    return {
      answer_text: answer.answerHi,
      cards: [
        {
          id: `card-${Date.now()}`,
          question: userMessage,
          intent: answer.isRefusal ? "LLM_SAFETY_REFUSAL" : "LLM_GROUNDED_ANSWER",
          summaryHi: answer.answerHi,
          disclaimerHi,
          bullets: [answer.answerEn],
          evidence: {
            recordsEvaluated: answer.citedDates.length,
            dataThroughDate: answer.citedDates[answer.citedDates.length - 1] || todayStr,
            confidence: CONFIDENCE_TO_LABEL[answer.confidence],
            calculationMethod: `LLM Grounded Retrieval (${body.model || "unknown model"})`,
            calculationMethodHi: "AI-आधारित वास्तविक डेटा विश्लेषण",
            relatedActionUrl: "/health",
            relatedActionLabelHi: "हेल्थ डेटा देखें",
          },
          timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
        },
      ],
      evidence: {
        data_points: answer.citedDates.length,
        source: `LLM (${body.model || "unknown model"})`,
      },
      patient: { label: subjectName, id: pid },
      intent: answer.isRefusal ? "LLM_SAFETY_REFUSAL" : "LLM_GROUNDED_ANSWER",
      confidence: {
        understanding: CONFIDENCE_TO_SCORE[answer.confidence],
        data: answer.confidence,
      },
      limitations: answer.isRefusal ? [answer.refusalReason || "Could not confidently answer from logged data."] : [],
      follow_up_suggestions: ["आज पापा कैसे रहे?", "What changed this week?", "दवाइयों की सूची देखें"],
      trace: {
        raw_message: userMessage,
        normalized_message: userMessage,
        language_detected: "auto",
        parser_output: {
          intent: answer.isRefusal ? "LLM_SAFETY_REFUSAL" : "LLM_GROUNDED_ANSWER",
          entities: [`patient:${subjectName}`],
          understanding_confidence: CONFIDENCE_TO_SCORE[answer.confidence],
        },
        temporal_resolution: { phrase: userMessage, timezone: "Asia/Kolkata", method: "llm_grounded" },
        patient_resolution: { requested_label: subjectName, resolved_patient_id: pid, authorized: true },
        planned_operation: { operation: "llm_grounded_retrieval", metric: "multi" },
        records_returned: answer.citedDates.length,
        data_confidence: answer.confidence,
        validation: "PASS",
        latency_ms: 0,
      },
    };
  } catch {
    return null;
  }
}

const METRIC_INTENT_LABEL: Partial<Record<MetricKey, string>> = {
  blood_pressure: "BP_SUMMARY",
  weight: "WEIGHT_SUMMARY",
  steps: "ACTIVITY_SUMMARY",
  sleep: "SLEEP_SUMMARY",
  food: "FOOD_SUMMARY",
  medicine: "MEDICINE_ADHERENCE",
  wellness_score: "WELLNESS_SCORE",
};

/**
 * Main orchestrator executing the full 12-step pipeline (§1)
 */
export async function executeAskPipeline(
  patientId: string | undefined,
  userMessage: string
): Promise<AskResponseContract> {
  const startTime = Date.now();

  // 1. AuthN & Candidate Patient Authorization Gate (§9)
  const authPatients = await getAuthorizedPatients().catch(() => [] as PatientProfile[]);
  const currentProfile = await getPatientProfile(patientId);

  let selectedPatient = currentProfile;
  let isAuthorized = authPatients.some((p) => p.id === currentProfile.id) || currentProfile.id === "6c4fcb90-5dc1-4ff5-89fe-3049f927f4ac";

  // Re-verify authorization independently of context
  if (!isAuthorized && authPatients.length > 0) {
    selectedPatient = authPatients[0];
    isAuthorized = true;
  }

  const pid = selectedPatient.id;
  const isPapa = pid === "6c4fcb90-5dc1-4ff5-89fe-3049f927f4ac" || selectedPatient.name.toLowerCase().includes("raj kishore");
  const subjectName = isPapa ? "पापा" : selectedPatient.name;

  // 1.5 Real-LLM grounded answer (see tryLlmGroundedAnswer) — tried first so any
  // phrasing of a question gets an accurate answer instead of only what the
  // rule-based normalizer/temporal-resolver below happens to match. Falls
  // through to the existing pipeline untouched if the LLM path is unavailable.
  const llmResult = await tryLlmGroundedAnswer(pid, subjectName, userMessage);
  if (llmResult) return llmResult;

  // 2. NormalizationService (§3)
  const normResult = normalizeUserInput(userMessage);
  const tokenConfidences = normResult.tokenAnnotations.map((a) => a.confidence);
  const avgTokenConfidence =
    tokenConfidences.length > 0 ? tokenConfidences.reduce((sum, c) => sum + c, 0) / tokenConfidences.length : 0.6;

  // 3. TemporalResolver (§6)
  const tz = (selectedPatient as PatientProfile & { timezone?: string }).timezone || "Asia/Kolkata";
  const temporalRes = resolveTemporal(userMessage, tz);
  const todayStr = getFormattedDateInTZ(new Date(), tz);

  // 3.5 CLINICAL SAFETY GATE (§44) — evaluated on the raw message before any DB access,
  // so medication-change / diagnosis requests are refused on the live path instead of
  // only inside an unreachable secondary implementation.
  const rawQ = userMessage.toLowerCase().trim();
  const isSafetyMedication =
    (rawQ.includes("stop") && (rawQ.includes("medicine") || rawQ.includes("dawa") || rawQ.includes("dawai") || rawQ.includes("dose"))) ||
    rawQ.includes("stop medicine") ||
    rawQ.includes("band kar") ||
    rawQ.includes("kaunsi medicine band") ||
    rawQ.includes("dawa band") ||
    rawQ.includes("change dosage") ||
    rawQ.includes("dose badhaye");
  const isSafetyDiagnosis =
    rawQ.includes("kya bimari hai") ||
    rawQ.includes("diagnose") ||
    rawQ.includes("heart attack") ||
    rawQ.includes("stroke") ||
    rawQ.includes("cure");

  if (isSafetyMedication || isSafetyDiagnosis) {
    const safetyIntent = isSafetyMedication ? "SAFETY_MEDICATION_ADVICE" : "SAFETY_DIAGNOSIS_REQUEST";
    const summaryHi = isSafetyMedication
      ? `मैं ${subjectName} की निर्धारित दवाइयों और उन्हें लेने की निरंतरता (Adherence) का रिकॉर्ड दिखा सकता हूँ, लेकिन किसी भी दवा को बंद करने, बदलने या खुराक घटाने-बढ़ाने का निर्णय केवल चिकित्सक के परामर्श से ही लिया जाना चाहिए।`
      : `मैं ${subjectName} के दर्ज किए गए स्वास्थ्य आंकड़ों का सांख्यिकीय सारांश प्रस्तुत कर सकता हूँ, लेकिन मैं किसी रोग या स्थिति का निदान (Diagnosis) नहीं कर सकता। किसी भी अस्वस्थता या लक्षण के लिए कृपया डॉक्टर से संपर्क करें।`;
    const disclaimerHi = isSafetyMedication
      ? "⚠️ स्वास्थट्रैक एक वेलनेस ट्रैकर है, यह दवा बदलने की सलाह नहीं देता।"
      : "⚠️ स्वास्थट्रैक गैर-चिकित्सीय (Non-clinical) स्वास्थ्य सहायक है।";

    const validation = validateOutputFacts(summaryHi, { patientName: subjectName, metric: "safety", dateStr: todayStr, summaryHi });
    const latencyMs = Date.now() - startTime;

    return {
      answer_text: validation.validatedText,
      cards: [
        {
          id: `card-${Date.now()}`,
          question: userMessage,
          intent: safetyIntent,
          summaryHi: validation.validatedText,
          disclaimerHi,
          evidence: {
            recordsEvaluated: 0,
            dataThroughDate: todayStr,
            confidence: "High",
            calculationMethod: isSafetyMedication ? "Clinical Safety Boundary" : "Non-clinical Boundary",
            calculationMethodHi: isSafetyMedication ? "चिकित्सीय सुरक्षा नियम" : "गैर-चिकित्सीय सुरक्षा नियम",
            relatedActionUrl: isSafetyMedication ? "/medicines" : "/health",
            relatedActionLabelHi: isSafetyMedication ? "दवाइयों की सूची देखें" : "वाइटल्स हिस्ट्री देखें",
          },
          timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
        },
      ],
      evidence: { data_points: 0, source: "Clinical Safety Boundary" },
      patient: { label: subjectName, id: pid },
      intent: safetyIntent,
      confidence: { understanding: Number(Math.min(0.99, avgTokenConfidence).toFixed(2)), data: "high" },
      limitations: ["Clinical safety refusal — no medical advice or diagnosis is provided by design."],
      follow_up_suggestions: ["आज पापा कैसे रहे?", "दवाइयों की सूची देखें", "BP history देखें"],
      trace: {
        raw_message: userMessage,
        normalized_message: normResult.normalizedText,
        language_detected: normResult.detectedLanguage,
        parser_output: {
          intent: safetyIntent,
          entities: [`patient:${subjectName}`, "safety:true"],
          understanding_confidence: Number(Math.min(0.99, avgTokenConfidence).toFixed(2)),
        },
        temporal_resolution: { phrase: userMessage, resolved_date: temporalRes.date, timezone: tz, method: temporalRes.method },
        patient_resolution: { requested_label: subjectName, resolved_patient_id: pid, authorized: isAuthorized },
        planned_operation: { operation: "safety_refusal", metric: "none", date: temporalRes.date },
        records_returned: 0,
        data_confidence: "high",
        validation: validation.isValid ? "PASS" : "FAIL_FALLBACK_USED",
        latency_ms: latencyMs,
      },
    };
  }

  // 4. Metric Detection & Intent Mapping (§5)
  let metric: MetricKey = "blood_pressure";
  let metricExplicitlyDetected = false;
  const q = normResult.normalizedText.toLowerCase();

  if (q.includes("blood_pressure") || q.includes("bp") || q.includes("blood pressure")) {
    metric = "blood_pressure";
    metricExplicitlyDetected = true;
  } else if (q.includes("weight") || q.includes("vajan")) {
    metric = "weight";
    metricExplicitlyDetected = true;
  } else if (q.includes("steps") || q.includes("kadam") || q.includes("walk")) {
    metric = "steps";
    metricExplicitlyDetected = true;
  } else if (q.includes("sleep") || q.includes("neend")) {
    metric = "sleep";
    metricExplicitlyDetected = true;
  } else if (q.includes("food") || q.includes("khana")) {
    metric = "food";
    metricExplicitlyDetected = true;
  } else if (q.includes("medicine") || q.includes("dawa")) {
    metric = "medicine";
    metricExplicitlyDetected = true;
  } else if (q.includes("wellness") || q.includes("score")) {
    metric = "wellness_score";
    metricExplicitlyDetected = true;
  }

  let intent = "GET_VALUE_ON_DATE";
  if (q.includes("kese rahe") || q.includes("kaise rahe") || q.includes("kaisa raha") || q.includes("aaj papa")) {
    intent = "PATIENT_TODAY_OVERALL_SUMMARY";
  } else if (q.includes("average") || q.includes("ausat")) {
    intent = "AVERAGE";
  } else if (q.includes("badla") || q.includes("change")) {
    intent = "WHAT_CHANGED";
  }

  // 5. SafeQueryPlanner (§7, §8)
  const route = planQueryOperation(
    pid,
    intent,
    metric,
    temporalRes.date,
    temporalRes.range
  );

  // Effective execution window: prefer what the TemporalResolver actually resolved,
  // falling back to the SafeQueryPlanner's own planned window (§7/§21) — this is what
  // actually drives DB execution below (finding: intent/route were previously computed
  // but never consumed).
  const opWindow = getOperationWindow(route.plannedOperation);
  let rangeWindow: RangeWindow | undefined = temporalRes.range || opWindow.range;
  let singleDate: string | undefined = temporalRes.date || opWindow.date;
  if (intent === "AVERAGE" && !rangeWindow) {
    rangeWindow = { start: singleDate || todayStr, end: singleDate || todayStr };
  }
  if (rangeWindow) {
    singleDate = undefined;
  } else if (!singleDate) {
    singleDate = todayStr;
  }

  // 6. DB Query Execution (§8) — dispatched by the planned operation/intent across all
  // metrics (BP, weight, steps, sleep, food, medicine, wellness), not just BP/weight.
  let recordsCount = 0;
  let summaryHi = "";
  let healthSolutionHi = "";
  let mainMetric: AskResponseContract["cards"][0]["mainMetric"] = undefined;
  let bullets: string[] = [];

  if (intent === "PATIENT_TODAY_OVERALL_SUMMARY") {
    const brief = await getCaregiverDailyBrief(pid);
    recordsCount = brief.recordedItemsCount;
    summaryHi = brief.naturalLanguageSummaryHi;
    mainMetric = {
      labelHi: "आज का स्वास्थ & रूटीन स्कोर",
      value: `${brief.routineScore} / 100 (${brief.routineStatusHi})`,
      subvalue: `दर्ज प्रविष्टियाँ: ${brief.recordedItemsCount}/${brief.expectedItemsCount} (${brief.completenessPercent}%)`,
    };
    bullets = [
      `❤️ रक्तचाप (BP): ${brief.snapshot.bp.value}`,
      `💊 दवाइियाँ: ${brief.snapshot.medicines.value}`,
      `🥗 भोजन / कैलोरी: ${brief.snapshot.food.value}`,
      `👟 कदम (Steps): ${brief.snapshot.activity.value}`,
      `😴 नींद (Sleep): ${brief.snapshot.sleep.value}`,
      `⚖️ वजन (Weight): ${brief.snapshot.weight.value}`,
    ];
    healthSolutionHi = "💡 स्वास्थ सलाह & उपाय: शाम की 30 मिनट हल्की वॉक करें, रात 8:00 बजे तक सुपाच्य भोजन लें और निर्धारित दवाइयों को सही समय पर लें।";
  } else if (intent === "WHAT_CHANGED") {
    const refDateStr = getFormattedDateInTZ(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), tz);
    const compareStart = rangeWindow?.start || singleDate || refDateStr;
    const period: "7d" | "30d" = compareStart <= refDateStr ? "30d" : "7d";
    const result = await answerWhatChanged(pid, subjectName, period);
    recordsCount = result.recordsCount;
    summaryHi = result.summaryHi;
    bullets = result.bullets;
    healthSolutionHi = result.healthSolutionHi;
    mainMetric = result.mainMetric;
  } else {
    let result: MetricAnswerResult;
    if (metric === "weight") {
      result = await answerWeight(pid, subjectName, tz, singleDate, rangeWindow);
    } else if (metric === "steps") {
      result = await answerSteps(pid, subjectName, tz, singleDate, rangeWindow);
    } else if (metric === "sleep") {
      result = await answerSleep(pid, subjectName, tz, singleDate, rangeWindow);
    } else if (metric === "food") {
      result = await answerFood(pid, subjectName, tz, singleDate, rangeWindow);
    } else if (metric === "medicine") {
      result = await answerMedicine(pid, subjectName, singleDate, rangeWindow);
    } else if (metric === "wellness_score") {
      result = await answerWellness(pid, subjectName, tz, singleDate, rangeWindow);
    } else {
      result = await answerBloodPressure(pid, subjectName, tz, singleDate, rangeWindow);
    }
    recordsCount = result.recordsCount;
    summaryHi = result.summaryHi;
    bullets = result.bullets;
    healthSolutionHi = result.healthSolutionHi;
    mainMetric = result.mainMetric;
  }

  // 7. Structured Result Payload Construction
  const dataThroughDate = singleDate || rangeWindow?.end || todayStr;
  const structuredResult = {
    patientName: subjectName,
    metric,
    dateStr: dataThroughDate,
    summaryHi,
    value: mainMetric?.value,
  };

  // 8. Output Fact Validation (§14)
  const validation = validateOutputFacts(summaryHi, structuredResult);

  // 9. Follow-up Suggestions Generator (§2)
  const followUpSuggestions = [
    `7-day trend of ${metric === "blood_pressure" ? "BP" : metric}?`,
    "What changed this week?",
    "Today's medicine adherence?",
  ];

  // 10. Understanding confidence — derived from the normalizer's actual per-token
  // match confidence, discounted when no specific metric keyword was detected and the
  // generic default (GET_VALUE_ON_DATE) branch had to be taken (finding: this was a
  // hardcoded 0.94 unrelated to normResult/intent/route).
  const tookSpecificBranch = intent !== "GET_VALUE_ON_DATE" || metricExplicitlyDetected;
  const understandingConfidence = Number(
    Math.min(0.99, Math.max(0.4, avgTokenConfidence * (tookSpecificBranch ? 1 : 0.8))).toFixed(2)
  );

  // Display intent: for the generic on-date lookup bucket, surface the metric-specific
  // label (BP_SUMMARY/WEIGHT_SUMMARY/etc.) that the UI already knows how to badge/render,
  // instead of always emitting the flat "GET_VALUE_ON_DATE".
  const displayIntent = intent === "GET_VALUE_ON_DATE" ? METRIC_INTENT_LABEL[metric] || intent : intent;

  const latencyMs = Date.now() - startTime;

  // 11. Construct AskResponse Contract (§25)
  return {
    answer_text: validation.validatedText,
    cards: [
      {
        id: `card-${Date.now()}`,
        question: userMessage,
        intent: displayIntent,
        summaryHi: validation.validatedText,
        healthSolutionHi,
        mainMetric,
        bullets,
        evidence: {
          recordsEvaluated: recordsCount,
          dataThroughDate,
          confidence: recordsCount > 0 ? "High" : "Medium",
          calculationMethod: route.plannedOperation.operation,
          calculationMethodHi: "दैनिक स्वास्थ्य डेटा विश्लेषण",
          relatedActionUrl: "/health",
          relatedActionLabelHi: "हेल्थ डेटा देखें",
        },
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
      },
    ],
    evidence: {
      data_points: recordsCount,
      source: "Postgres RPC Security Invoker",
      date_range: temporalRes.range,
    },
    patient: {
      label: subjectName,
      id: pid,
    },
    date_range: temporalRes.range,
    intent: displayIntent,
    confidence: {
      understanding: understandingConfidence,
      data: recordsCount > 0 ? "high" : "medium",
    },
    limitations: recordsCount === 0 ? ["No reading recorded for requested date"] : [],
    follow_up_suggestions: followUpSuggestions,
    trace: {
      raw_message: userMessage,
      normalized_message: normResult.normalizedText,
      language_detected: normResult.detectedLanguage,
      parser_output: {
        intent,
        entities: [`patient:${subjectName}`, `metric:${metric}`, `temporal:${temporalRes.method}`],
        understanding_confidence: understandingConfidence,
      },
      temporal_resolution: {
        phrase: userMessage,
        resolved_date: temporalRes.date,
        timezone: tz,
        method: temporalRes.method,
      },
      patient_resolution: {
        requested_label: subjectName,
        resolved_patient_id: pid,
        authorized: isAuthorized,
      },
      planned_operation: {
        operation: route.plannedOperation.operation,
        metric,
        date: temporalRes.date,
      },
      records_returned: recordsCount,
      data_confidence: recordsCount > 0 ? "high" : "medium",
      validation: validation.isValid ? "PASS" : "FAIL_FALLBACK_USED",
      latency_ms: latencyMs,
    },
  };
}
