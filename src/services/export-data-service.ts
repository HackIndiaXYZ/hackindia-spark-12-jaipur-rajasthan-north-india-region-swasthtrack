/**
 * Full data export (CSV and JSON). Reads the patient's complete history with the
 * range readers (no row limits), writes only what the record really contains, and
 * downloads it from the browser.
 */
import { toISTDate, todayIST } from "@/lib/health-rules";
import { buildExportCsv, type ExportData } from "@/lib/analytics/export-csv";
import { safeFileName } from "@/lib/analytics/csv";
import {
  getActivityLogsInRange,
  getBloodPressureLogsInRange,
  getFoodLogsInRange,
  getMedicineLogsInRange,
  getMedicines,
  getPatientProfile,
  getSleepLogsInRange,
  getWeightLogsInRange,
} from "./patient-service";
import { getPatientSettingsOrDefault } from "./settings-service";

export interface FullPatientExportData extends ExportData {
  settings: {
    daily_calorie_target: number;
    daily_step_goal: number;
    sleep_target_hours: number;
    bp_monitoring_schedule: string;
    bp_targets: Record<string, number>;
  };
  /** IST dates (inclusive) covered by the readings. */
  range: { from: string; to: string };
}

/** Earliest date any reading could plausibly have; the readers page through everything in between. */
const HISTORY_START = "2000-01-01";

async function collect(patientId?: string): Promise<{ data: FullPatientExportData; fileStem: string }> {
  const profile = await getPatientProfile(patientId);
  const pid = patientId || profile.id;
  const today = todayIST();

  const medicines = await getMedicines(pid);
  // Doses are only meaningful from the day the first medicine existed.
  const firstMedicineDay = medicines.length
    ? medicines.map((m) => toISTDate(m.created_at)).reduce((a, b) => (b < a ? b : a))
    : today;

  const [settings, bp, weight, food, sleep, activity, medLogs] = await Promise.all([
    getPatientSettingsOrDefault(pid),
    getBloodPressureLogsInRange(pid, HISTORY_START, today),
    getWeightLogsInRange(pid, HISTORY_START, today),
    getFoodLogsInRange(pid, HISTORY_START, today),
    getSleepLogsInRange(pid, HISTORY_START, today),
    getActivityLogsInRange(pid, HISTORY_START, today),
    getMedicineLogsInRange(pid, firstMedicineDay, today),
  ]);

  const nameById = new Map(medicines.map((m) => [m.id, m.medicine_name]));

  // Only fields the record really has: unknown age / gender / blood group stay out.
  const patient: FullPatientExportData["patient"] = { id: profile.id, name: profile.name };
  if (profile.age != null) patient.age = profile.age;
  if (profile.gender) patient.gender = profile.gender;
  if (profile.height_cm != null) patient.height_cm = profile.height_cm;
  if (profile.current_weight_kg != null) patient.current_weight_kg = profile.current_weight_kg;
  if (profile.target_weight_kg != null) patient.target_weight_kg = profile.target_weight_kg;
  if (profile.daily_calorie_target != null) patient.daily_calorie_target = profile.daily_calorie_target;

  const data: FullPatientExportData = {
    exportedAt: new Date().toISOString(),
    patient,
    settings: {
      daily_calorie_target: settings.daily_calorie_target,
      daily_step_goal: settings.daily_step_goal,
      sleep_target_hours: settings.sleep_target_hours,
      bp_monitoring_schedule: settings.bp_monitoring_schedule,
      bp_targets: { ...settings.bp_targets },
    },
    range: { from: HISTORY_START, to: today },
    medicines: medicines.map((m) => ({
      medicine_name: m.medicine_name,
      dose: m.dose,
      scheduled_time: m.scheduled_time,
      frequency: m.frequency,
      meal_relation: m.meal_relation,
      active: m.active,
    })),
    medicineLogs: medLogs.map((l) => ({
      id: l.id,
      medicineName: nameById.get(l.medicine_id) ?? "Unknown medicine",
      scheduled_time: l.scheduled_time,
      taken_time: l.taken_time,
      status: l.status,
      notes: l.notes,
      isComputed: l.id.startsWith("auto-missed-"),
    })),
    bpLogs: bp.map((b) => ({
      measured_at: b.measured_at,
      systolic: b.systolic,
      diastolic: b.diastolic,
      pulse: b.pulse,
      reading_type: b.reading_type,
      notes: b.notes,
    })),
    weightLogs: weight.map((w) => ({ measured_at: w.measured_at, weight_kg: w.weight_kg, notes: w.notes })),
    foodLogs: food.map((f) => ({
      consumed_at: f.consumed_at,
      meal_type: f.meal_type,
      food_name: f.food_name,
      quantity: f.quantity,
      unit: f.unit,
      calories: f.calories,
      protein_g: f.protein_g,
      carbs_g: f.carbs_g,
      fat_g: f.fat_g,
      notes: f.notes,
    })),
    sleepLogs: sleep.map((s) => ({ date: s.date, sleep_hours: s.sleep_hours, bedtime: s.bedtime, wake_time: s.wake_time, notes: s.notes })),
    activityLogs: activity.map((a) => ({
      date: a.date,
      steps: a.steps,
      distance_km: a.distance_km,
      walking_minutes: a.walking_minutes,
      estimated_calories_burned: a.estimated_calories_burned,
    })),
  };
  return { data, fileStem: safeFileName(profile.name) };
}

function download(content: string, mime: string, fileName: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportAllDataAsJson(patientId?: string): Promise<void> {
  const { data, fileStem } = await collect(patientId);
  download(JSON.stringify(data, null, 2), "application/json", `SwasthTrack_${fileStem}_Export_${todayIST()}.json`);
}

export async function exportAllDataAsCsv(patientId?: string): Promise<void> {
  const { data, fileStem } = await collect(patientId);
  download(buildExportCsv(data), "text/csv;charset=utf-8;", `SwasthTrack_${fileStem}_Health_Logs_${todayIST()}.csv`);
}
