import { isPlausibleBP } from "@/lib/health-rules";
import type {
  ActivityLogEntry,
  BPLogEntry,
  SleepLogEntry,
  WeightLogEntry,
} from "./patient-service";

export type DataQualityStatus = "valid" | "questionable" | "invalid";

export interface QualityValidationResult<T> {
  record: T;
  status: DataQualityStatus;
  reason?: string;
  reasonHi?: string;
}

/** What the analytics did with questionable / unusable rows, so the UI can say so. */
export interface DataQualitySummary {
  /** Kept in the calculation but flagged (e.g. unusually high reading, odd pulse). */
  questionableCount: number;
  /** Left out of the calculation (impossible values). */
  invalidCount: number;
  notes: Array<{ en: string; hi: string }>;
}

export const EMPTY_QUALITY: DataQualitySummary = { questionableCount: 0, invalidCount: 0, notes: [] };

/**
 * Validate Blood Pressure reading. Plausibility comes from health-rules so every
 * service agrees on what an impossible reading is.
 */
export function validateBPRecord(log: BPLogEntry): QualityValidationResult<BPLogEntry> {
  const { systolic: sys, diastolic: dia, pulse } = log;

  if (!(sys > 0) || !(dia > 0)) {
    return {
      record: log,
      status: "invalid",
      reason: "Blood pressure values cannot be zero or negative.",
      reasonHi: "रक्तचाप के मान शून्य या ऋणात्मक नहीं हो सकते।",
    };
  }
  if (sys <= dia) {
    return {
      record: log,
      status: "invalid",
      reason: "Systolic must be higher than diastolic.",
      reasonHi: "ऊपर वाला BP (सिस्टोलिक) नीचे वाले (डायस्टोलिक) से ज़्यादा होना चाहिए।",
    };
  }
  if (!isPlausibleBP(sys, dia, pulse)) {
    return {
      record: log,
      status: "invalid",
      reason: `Physiologically implausible reading (${sys}/${dia} mmHg${pulse != null ? `, pulse ${pulse}` : ""}).`,
      reasonHi: `असंभव BP मान (${sys}/${dia} mmHg${pulse != null ? `, नब्ज़ ${pulse}` : ""}) — शायद एंट्री में गलती हुई।`,
    };
  }
  if (pulse != null && (pulse < 30 || pulse > 220)) {
    return {
      record: log,
      status: "questionable",
      reason: `Pulse rate outside the usual range (${pulse} bpm). Please verify.`,
      reasonHi: `नब्ज़ सामान्य सीमा से बाहर है (${pulse} bpm) — कृपया जाँच लें।`,
    };
  }
  if (sys > 200 || dia > 120) {
    return {
      record: log,
      status: "questionable",
      reason: "Very high reading. It is kept and treated as urgent, but please verify the entry.",
      reasonHi: "बहुत ज़्यादा माप। इसे गंभीर माना गया है, पर कृपया जाँच लें कि मान सही दर्ज हुआ है।",
    };
  }
  return { record: log, status: "valid" };
}

export function validateWeightRecord(log: WeightLogEntry): QualityValidationResult<WeightLogEntry> {
  const wt = log.weight_kg;
  if (!(wt > 0)) {
    return {
      record: log,
      status: "invalid",
      reason: "Weight cannot be zero or negative.",
      reasonHi: "वज़न शून्य या ऋणात्मक नहीं हो सकता।",
    };
  }
  if (wt < 20 || wt > 300) {
    return {
      record: log,
      status: "invalid",
      reason: `Weight outside the plausible human range (${wt} kg).`,
      reasonHi: `असंभव वज़न (${wt} kg)।`,
    };
  }
  return { record: log, status: "valid" };
}

export function validateActivityRecord(log: ActivityLogEntry): QualityValidationResult<ActivityLogEntry> {
  if (log.steps < 0) {
    return {
      record: log,
      status: "invalid",
      reason: "Step count cannot be negative.",
      reasonHi: "कदम की संख्या ऋणात्मक नहीं हो सकती।",
    };
  }
  if (log.steps > 100000) {
    return {
      record: log,
      status: "questionable",
      reason: `Extremely high step count (${log.steps.toLocaleString("en-IN")}). Please verify.`,
      reasonHi: `कदम की संख्या बहुत ज़्यादा है (${log.steps.toLocaleString("en-IN")}) — कृपया जाँच लें।`,
    };
  }
  return { record: log, status: "valid" };
}

export function validateSleepRecord(log: SleepLogEntry): QualityValidationResult<SleepLogEntry> {
  const hours = Number(log.sleep_hours);
  if (!(hours > 0) || hours > 24) {
    return {
      record: log,
      status: "invalid",
      reason: "Sleep duration must be between 0 and 24 hours.",
      reasonHi: "नींद की अवधि 0 से 24 घंटे के बीच होनी चाहिए।",
    };
  }
  if (hours > 18) {
    return {
      record: log,
      status: "questionable",
      reason: `Very long sleep duration (${hours} hrs). Please verify.`,
      reasonHi: `नींद बहुत लंबी दर्ज है (${hours} घंटे) — कृपया जाँच लें।`,
    };
  }
  return { record: log, status: "valid" };
}

/** Split rows by quality so callers can use `valid`+`questionable` and report the rest. */
function assess<T>(rows: T[], validate: (r: T) => QualityValidationResult<T>) {
  const valid: T[] = [];
  const questionable: Array<QualityValidationResult<T>> = [];
  const invalid: Array<QualityValidationResult<T>> = [];
  for (const row of rows) {
    const res = validate(row);
    if (res.status === "invalid") invalid.push(res);
    else {
      valid.push(row);
      if (res.status === "questionable") questionable.push(res);
    }
  }
  return { usable: valid, questionable, invalid };
}

export const assessBPLogs = (logs: BPLogEntry[]) => assess(logs, validateBPRecord);
export const assessWeightLogs = (logs: WeightLogEntry[]) => assess(logs, validateWeightRecord);
export const assessActivityLogs = (logs: ActivityLogEntry[]) => assess(logs, validateActivityRecord);
export const assessSleepLogs = (logs: SleepLogEntry[]) => assess(logs, validateSleepRecord);

/** Roll several assessments into one summary the UI can show ("2 readings were flagged"). */
export function summarizeQuality(
  parts: Array<{
    label: { en: string; hi: string };
    questionable: Array<QualityValidationResult<unknown>>;
    invalid: Array<QualityValidationResult<unknown>>;
  }>,
): DataQualitySummary {
  const out: DataQualitySummary = { questionableCount: 0, invalidCount: 0, notes: [] };
  for (const p of parts) {
    out.questionableCount += p.questionable.length;
    out.invalidCount += p.invalid.length;
    if (p.invalid.length > 0) {
      out.notes.push({
        en: `${p.invalid.length} ${p.label.en} record(s) look like entry errors and were left out of the analysis.`,
        hi: `${p.invalid.length} ${p.label.hi} रिकॉर्ड गलत एंट्री जैसे लगे, इसलिए विश्लेषण में नहीं गिने।`,
      });
    }
    if (p.questionable.length > 0) {
      out.notes.push({
        en: `${p.questionable.length} ${p.label.en} record(s) are unusual; they are included but worth double-checking.`,
        hi: `${p.questionable.length} ${p.label.hi} रिकॉर्ड असामान्य हैं; इन्हें गिना गया है, पर एक बार जाँच लें।`,
      });
    }
  }
  return out;
}

/**
 * Drop only impossible rows. Questionable rows are kept (a very high BP must never
 * vanish from the analysis); use the assess* functions to report them.
 */
export function filterValidBPLogs(logs: BPLogEntry[]): BPLogEntry[] {
  return assessBPLogs(logs).usable;
}

export function filterValidWeightLogs(logs: WeightLogEntry[]): WeightLogEntry[] {
  return assessWeightLogs(logs).usable;
}

export function filterValidActivityLogs(logs: ActivityLogEntry[]): ActivityLogEntry[] {
  return assessActivityLogs(logs).usable;
}

export function filterValidSleepLogs(logs: SleepLogEntry[]): SleepLogEntry[] {
  return assessSleepLogs(logs).usable;
}
