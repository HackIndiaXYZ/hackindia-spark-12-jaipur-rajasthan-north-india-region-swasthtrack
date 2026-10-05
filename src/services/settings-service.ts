import { getActivePatientId } from "@/lib/active-patient";
import {
  DEFAULT_ALERT_TOGGLES,
  DEFAULT_BP_THRESHOLDS,
  DEFAULT_SLEEP_TARGET,
  DEFAULT_STEP_GOAL,
  resolveBPThresholds,
  type BPThresholds,
} from "@/lib/health-rules";
import type { Database } from "@/lib/supabase/database.types";
import {
  NoActivePatientError,
  PermissionDeniedError,
  SupabaseNotConfiguredError,
  getDbClient,
  getPatientProfile,
  isSupabaseConfigured,
  supabase,
} from "./patient-service";

type SettingsRow = Database["public"]["Tables"]["patient_settings"]["Row"];

export type BPScheduleType = "morning_evening" | "morning_only" | "evening_only" | "custom";
export type WeightUnit = "kg" | "lb";
export type HeightUnit = "cm" | "ft_in";
export type DistanceUnit = "km" | "miles";
export type LanguagePref = "hi" | "en" | "bilingual";

export interface AlertPreferences {
  bp: boolean;
  medicine: boolean;
  activity: boolean;
  sleep: boolean;
  missingData: boolean;
}

export interface PatientSettings {
  patient_id: string;
  daily_calorie_target: number;
  daily_step_goal: number;
  sleep_target_hours: number;
  bp_monitoring_schedule: BPScheduleType;
  weight_unit: WeightUnit;
  height_unit: HeightUnit;
  distance_unit: DistanceUnit;
  timezone: string;
  preferred_language: LanguagePref;
  alerts_enabled: AlertPreferences;
  /** Per-patient blood-pressure lines (target / alert / crisis / low). Never hard-coded elsewhere. */
  bp_targets: BPThresholds;
  updated_at?: string;
  /** True when no saved row exists and these are the built-in defaults. */
  is_default?: boolean;
}

export const DEFAULT_SETTINGS: PatientSettings = {
  patient_id: "",
  daily_calorie_target: 1600,
  daily_step_goal: DEFAULT_STEP_GOAL,
  sleep_target_hours: DEFAULT_SLEEP_TARGET,
  bp_monitoring_schedule: "morning_evening",
  weight_unit: "kg",
  height_unit: "cm",
  distance_unit: "km",
  timezone: "Asia/Kolkata",
  preferred_language: "bilingual",
  alerts_enabled: { ...DEFAULT_ALERT_TOGGLES },
  bp_targets: { ...DEFAULT_BP_THRESHOLDS },
  is_default: true,
};

// ---------------------------------------------------------------------------
// Pure helpers (no I/O)
// ---------------------------------------------------------------------------

function finitePositive(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Keep thresholds clinically ordered (low < target < alert < crisis, systolic
 * above diastolic) so a typo in settings cannot silently disable an alert.
 * Anything that breaks the ordering falls back to the default for that line.
 */
export function sanitizeBPThresholds(input: Partial<BPThresholds> | null | undefined): BPThresholds {
  const t = resolveBPThresholds(input);
  const d = DEFAULT_BP_THRESHOLDS;
  const num = (v: number, fb: number) => (Number.isFinite(v) && v > 0 ? Math.round(v) : fb);
  const out: BPThresholds = {
    target_systolic: num(t.target_systolic, d.target_systolic),
    target_diastolic: num(t.target_diastolic, d.target_diastolic),
    alert_systolic: num(t.alert_systolic, d.alert_systolic),
    alert_diastolic: num(t.alert_diastolic, d.alert_diastolic),
    crisis_systolic: num(t.crisis_systolic, d.crisis_systolic),
    crisis_diastolic: num(t.crisis_diastolic, d.crisis_diastolic),
    low_systolic: num(t.low_systolic, d.low_systolic),
    low_diastolic: num(t.low_diastolic, d.low_diastolic),
  };
  if (!(out.low_systolic < out.target_systolic && out.target_systolic <= out.alert_systolic && out.alert_systolic <= out.crisis_systolic)) {
    out.low_systolic = d.low_systolic;
    out.target_systolic = d.target_systolic;
    out.alert_systolic = d.alert_systolic;
    out.crisis_systolic = d.crisis_systolic;
  }
  if (!(out.low_diastolic < out.target_diastolic && out.target_diastolic <= out.alert_diastolic && out.alert_diastolic <= out.crisis_diastolic)) {
    out.low_diastolic = d.low_diastolic;
    out.target_diastolic = d.target_diastolic;
    out.alert_diastolic = d.alert_diastolic;
    out.crisis_diastolic = d.crisis_diastolic;
  }
  return out;
}

/** Normalise a database row (or partial input) into a complete settings object. */
export function normalizeSettingsRow(
  row: Partial<SettingsRow> | null | undefined,
  patientId: string,
  fallbackCalorieTarget?: number | null,
): PatientSettings {
  if (!row) {
    return {
      ...DEFAULT_SETTINGS,
      patient_id: patientId,
      daily_calorie_target: finitePositive(fallbackCalorieTarget, DEFAULT_SETTINGS.daily_calorie_target),
      alerts_enabled: { ...DEFAULT_ALERT_TOGGLES },
      bp_targets: { ...DEFAULT_BP_THRESHOLDS },
      is_default: true,
    };
  }
  const alerts = (row.alerts_enabled ?? {}) as Partial<AlertPreferences>;
  return {
    patient_id: patientId,
    daily_calorie_target: finitePositive(row.daily_calorie_target, finitePositive(fallbackCalorieTarget, 1600)),
    daily_step_goal: finitePositive(row.daily_step_goal, DEFAULT_STEP_GOAL),
    sleep_target_hours: finitePositive(row.sleep_target_hours, DEFAULT_SLEEP_TARGET),
    bp_monitoring_schedule: row.bp_monitoring_schedule || "morning_evening",
    weight_unit: row.weight_unit || "kg",
    height_unit: row.height_unit || "cm",
    distance_unit: row.distance_unit || "km",
    timezone: row.timezone || "Asia/Kolkata",
    preferred_language: row.preferred_language || "bilingual",
    alerts_enabled: {
      bp: alerts.bp ?? true,
      medicine: alerts.medicine ?? true,
      activity: alerts.activity ?? true,
      sleep: alerts.sleep ?? true,
      missingData: alerts.missingData ?? true,
    },
    bp_targets: sanitizeBPThresholds(row.bp_targets),
    updated_at: row.updated_at ?? undefined,
    is_default: false,
  };
}

// ---------------------------------------------------------------------------
// Cache: per patient, short TTL, concurrent callers share one request
// ---------------------------------------------------------------------------

const SETTINGS_CACHE_TTL = 30_000;
const _cache = new Map<string, { settings: PatientSettings; at: number }>();
const _inflight = new Map<string, Promise<PatientSettings>>();

export function invalidateSettingsCache(patientId?: string): void {
  if (patientId) {
    _cache.delete(patientId);
    _inflight.delete(patientId);
    return;
  }
  _cache.clear();
  _inflight.clear();
}

function resolvePatientId(patientId?: string): string | null {
  return patientId || getActivePatientId() || null;
}

async function loadSettings(pid: string): Promise<PatientSettings> {
  let row: SettingsRow | null = null;
  if (isSupabaseConfigured) {
    const { data, error } = await getDbClient()
      .from("patient_settings")
      .select("*")
      .eq("patient_id", pid)
      .maybeSingle();
    if (error) {
      // Not cached: a transient failure must not pin defaults for the TTL.
      throw new Error(error.message || "patient_settings read failed");
    }
    row = data ?? null;
  }
  let fallbackCalories: number | null = null;
  if (!row) {
    // No saved row yet: the patient profile's own calorie target is the best default.
    try {
      fallbackCalories = (await getPatientProfile(pid)).daily_calorie_target ?? null;
    } catch {
      fallbackCalories = null;
    }
  }
  return normalizeSettingsRow(row, pid, fallbackCalories);
}

/**
 * Patient settings (goals, BP schedule, alert toggles, BP thresholds).
 * Falls back to defaults only when no row exists or there is no patient; a
 * failed read throws so callers do not silently score against made-up goals.
 */
export async function getPatientSettings(patientId?: string): Promise<PatientSettings> {
  const pid = resolvePatientId(patientId);
  if (!pid) return { ...DEFAULT_SETTINGS };

  const hit = _cache.get(pid);
  if (hit && Date.now() - hit.at < SETTINGS_CACHE_TTL) return hit.settings;

  const pending = _inflight.get(pid);
  if (pending) return pending;

  const request = loadSettings(pid)
    .then((settings) => {
      _cache.set(pid, { settings, at: Date.now() });
      return settings;
    })
    .finally(() => {
      _inflight.delete(pid);
    });
  _inflight.set(pid, request);
  return request;
}

/** Same as getPatientSettings but never throws: analytics fall back to defaults and say so. */
export async function getPatientSettingsOrDefault(patientId?: string): Promise<PatientSettings> {
  try {
    return await getPatientSettings(patientId);
  } catch {
    const pid = resolvePatientId(patientId) ?? "";
    return { ...DEFAULT_SETTINGS, patient_id: pid };
  }
}

/** The BP lines (target / alert / crisis / low) for this patient. */
export async function getBPThresholds(patientId?: string): Promise<BPThresholds> {
  const settings = await getPatientSettingsOrDefault(patientId);
  return settings.bp_targets;
}

/** Whether an alert category is switched on for this patient. */
export function isAlertEnabled(settings: Pick<PatientSettings, "alerts_enabled">, key: keyof AlertPreferences): boolean {
  return settings.alerts_enabled?.[key] !== false;
}

/**
 * Save settings. Only the fields passed are changed. Throws if the write fails
 * (the settings page shows the error instead of pretending it saved).
 */
export async function updatePatientSettings(
  patientId: string,
  updates: Partial<PatientSettings>,
): Promise<PatientSettings> {
  const pid = patientId || resolvePatientId();
  if (!pid) throw new NoActivePatientError();

  invalidateSettingsCache(pid);
  // Strict read on purpose: if the saved row cannot be read, falling back to the built-in defaults
  // here would write those defaults over the fields this call does not touch (units, timezone, language).
  const current = await getPatientSettings(pid);
  const merged: PatientSettings = {
    ...current,
    ...updates,
    patient_id: pid,
    alerts_enabled: { ...current.alerts_enabled, ...(updates.alerts_enabled ?? {}) },
    bp_targets: sanitizeBPThresholds({ ...current.bp_targets, ...(updates.bp_targets ?? {}) }),
    daily_calorie_target: finitePositive(updates.daily_calorie_target ?? current.daily_calorie_target, current.daily_calorie_target),
    daily_step_goal: finitePositive(updates.daily_step_goal ?? current.daily_step_goal, current.daily_step_goal),
    sleep_target_hours: Math.min(14, finitePositive(updates.sleep_target_hours ?? current.sleep_target_hours, current.sleep_target_hours)),
    updated_at: new Date().toISOString(),
    is_default: false,
  };

  if (!isSupabaseConfigured) throw new SupabaseNotConfiguredError();

  const { error } = await supabase.from("patient_settings").upsert(
    {
      patient_id: pid,
      daily_calorie_target: Math.round(merged.daily_calorie_target),
      daily_step_goal: Math.round(merged.daily_step_goal),
      sleep_target_hours: merged.sleep_target_hours,
      bp_monitoring_schedule: merged.bp_monitoring_schedule,
      weight_unit: merged.weight_unit,
      height_unit: merged.height_unit,
      distance_unit: merged.distance_unit,
      timezone: merged.timezone,
      preferred_language: merged.preferred_language,
      alerts_enabled: merged.alerts_enabled,
      bp_targets: merged.bp_targets,
      updated_at: merged.updated_at,
    },
    { onConflict: "patient_id" },
  );
  if (error) {
    // 42501 = Row Level Security refused: a viewer cannot change settings.
    if (error.code === "42501" || /row-level security/i.test(error.message)) throw new PermissionDeniedError();
    throw new Error(error.message || "Could not save settings");
  }

  _cache.set(pid, { settings: merged, at: Date.now() });
  return merged;
}
