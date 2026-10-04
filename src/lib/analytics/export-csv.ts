/**
 * Full-history CSV export (pure). One section per record type, each with its own
 * header row, every field RFC-4180 escaped. Only values the patient record
 * actually has are written: unknown demographics are left out, never defaulted.
 */
import { istMinutesOfDay, toISTDate } from "../health-rules";
import { toCsv, type CsvCell } from "./csv";

export interface ExportPatient {
  id: string;
  name: string;
  age?: number | null;
  gender?: string | null;
  height_cm?: number | null;
  current_weight_kg?: number | null;
  target_weight_kg?: number | null;
  daily_calorie_target?: number | null;
}

export interface ExportData {
  exportedAt: string;
  patient: ExportPatient;
  medicines: Array<{
    medicine_name: string;
    dose: string;
    scheduled_time: string;
    frequency: string;
    meal_relation: string | null;
    active: boolean;
  }>;
  medicineLogs: Array<{
    id: string;
    medicineName: string;
    scheduled_time: string;
    taken_time: string | null;
    status: string;
    notes: string | null;
    /** True for a dose with no entry that is counted as missed by the app (not a stored record). */
    isComputed: boolean;
  }>;
  bpLogs: Array<{ measured_at: string; systolic: number; diastolic: number; pulse: number | null; reading_type: string | null; notes: string | null }>;
  weightLogs: Array<{ measured_at: string; weight_kg: number; notes: string | null }>;
  foodLogs: Array<{
    consumed_at: string;
    meal_type: string;
    food_name: string;
    quantity: number;
    unit: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    notes: string | null;
  }>;
  sleepLogs: Array<{ date: string; sleep_hours: number; bedtime: string | null; wake_time: string | null; notes: string | null }>;
  activityLogs: Array<{ date: string; steps: number; distance_km: number; walking_minutes: number; estimated_calories_burned: number }>;
}

/** "HH:MM" in IST for an instant. */
export function istTime(ts: string): string {
  const m = istMinutesOfDay(ts);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function buildExportCsv(data: ExportData): string {
  const rows: CsvCell[][] = [];
  const section = (title: string, header: string[], body: CsvCell[][]) => {
    if (rows.length > 0) rows.push([]);
    rows.push([title]);
    rows.push(header);
    if (body.length === 0) rows.push(["(no records)"]);
    rows.push(...body);
  };

  rows.push(["SwasthTrack full data export"]);
  rows.push(["Exported at", data.exportedAt]);
  rows.push(["All dates and times are India Standard Time (IST)"]);
  rows.push([]);

  const p = data.patient;
  const patientRows: CsvCell[][] = [["Name", p.name]];
  if (p.age != null) patientRows.push(["Age", p.age]);
  if (p.gender) patientRows.push(["Gender", p.gender]);
  if (p.height_cm != null) patientRows.push(["Height (cm)", p.height_cm]);
  if (p.current_weight_kg != null) patientRows.push(["Current weight (kg)", p.current_weight_kg]);
  if (p.target_weight_kg != null) patientRows.push(["Target weight (kg)", p.target_weight_kg]);
  if (p.daily_calorie_target != null) patientRows.push(["Daily calorie target (kcal)", p.daily_calorie_target]);
  section("PATIENT", ["Field", "Value"], patientRows);

  section(
    "BLOOD PRESSURE",
    ["Date", "Time", "Systolic (mmHg)", "Diastolic (mmHg)", "Pulse (bpm)", "Reading type", "Notes"],
    data.bpLogs.map((b) => [toISTDate(b.measured_at), istTime(b.measured_at), b.systolic, b.diastolic, b.pulse, b.reading_type, b.notes]),
  );
  section(
    "WEIGHT",
    ["Date", "Time", "Weight (kg)", "Notes"],
    data.weightLogs.map((w) => [toISTDate(w.measured_at), istTime(w.measured_at), w.weight_kg, w.notes]),
  );
  section(
    "FOOD",
    ["Date", "Time", "Meal", "Food", "Quantity", "Unit", "Calories (kcal)", "Protein (g)", "Carbs (g)", "Fat (g)", "Notes"],
    data.foodLogs.map((f) => [
      toISTDate(f.consumed_at),
      istTime(f.consumed_at),
      f.meal_type,
      f.food_name,
      f.quantity,
      f.unit,
      f.calories,
      f.protein_g,
      f.carbs_g,
      f.fat_g,
      f.notes,
    ]),
  );
  section(
    "SLEEP",
    ["Date", "Sleep (hours)", "Bedtime", "Wake time", "Notes"],
    data.sleepLogs.map((s) => [s.date, s.sleep_hours, s.bedtime, s.wake_time, s.notes]),
  );
  section(
    "ACTIVITY",
    ["Date", "Steps", "Distance (km)", "Walking (minutes)", "Estimated calories burned (kcal)"],
    data.activityLogs.map((a) => [a.date, a.steps, a.distance_km, a.walking_minutes, a.estimated_calories_burned]),
  );
  section(
    "MEDICINES",
    ["Medicine", "Dose", "Scheduled time", "Frequency", "Meal relation", "Active"],
    data.medicines.map((m) => [m.medicine_name, m.dose, m.scheduled_time.slice(0, 5), m.frequency, m.meal_relation, m.active ? "Yes" : "No"]),
  );
  section(
    "MEDICINE DOSES",
    ["Date", "Medicine", "Status", "Taken at (IST)", "Source", "Notes"],
    data.medicineLogs.map((l) => [
      toISTDate(l.taken_time ?? l.scheduled_time),
      l.medicineName,
      l.status,
      l.taken_time ? istTime(l.taken_time) : "",
      l.isComputed ? "Computed: no entry, counted as missed" : "Logged",
      l.notes,
    ]),
  );

  return `﻿${toCsv(rows)}`;
}
