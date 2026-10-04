/**
 * Synthetic patients for the evaluation harness. Deterministic (seeded) so a
 * failing case reproduces exactly. These are NOT real people and never leave
 * the evaluation page.
 *
 * "Now" is fixed at 2026-10-04 09:30 IST so relative-date cases have stable answers.
 */

import { addDaysIST, istInstant } from "@/lib/health-rules";
import {
  buildContext,
  type ActivityRow,
  type BPRow,
  type FoodRow,
  type MedicineLogRow,
  type MedicineRow,
  type RawPatientData,
  type SleepRow,
  type WeightRow,
} from "../records";
import type { PatientContext } from "../types";

export const FIXTURE_NOW = new Date("2026-10-04T04:00:00.000Z"); // 09:30 IST
export const FIXTURE_TODAY = "2026-10-04";

export type ArchetypeId = "steady" | "crisis" | "sparse" | "missed_meds" | "high_sodium" | "empty";

export const ARCHETYPES: Array<{ id: ArchetypeId; title: string }> = [
  { id: "steady", title: "Well-controlled, complete logging" },
  { id: "crisis", title: "Crisis-range reading this morning" },
  { id: "sparse", title: "Sparse data (3 BP readings)" },
  { id: "missed_meds", title: "Many missed medicines" },
  { id: "high_sodium", title: "High-sodium, fried-food diet" },
  { id: "empty", title: "No data at all" },
];

// --- deterministic randomness -------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number, mean: number, sd: number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const iso = (date: string, hhmm: string) => istInstant(date, hhmm).toISOString();

// --- generators -------------------------------------------------------------

interface Profile {
  seed: number;
  /** Days of history actually logged (<= 120). */
  history: number;
  bpSys: (dayIdx: number, daysAgo: number) => number;
  bpDia: (dayIdx: number, daysAgo: number) => number;
  bpDayChance: number;
  food: "light" | "salty" | "none";
  sleepMean: number;
  stepsMean: number;
  weightStart: number;
  weightDrift: number;
  adherence: (daysAgo: number) => { taken: number; late: number };
  sleepLogs: boolean;
  stepLogs: boolean;
  weightLogs: boolean;
}

const MEDS: MedicineRow[] = [
  { id: "m-amlodipine", medicine_name: "Amlodipine", dose: "5 mg", scheduled_time: "08:00:00", meal_relation: "after_meal", frequency: "Once Daily", active: true, created_at: "2026-06-01T00:00:00.000Z" },
  { id: "m-clopidogrel", medicine_name: "Clopidogrel", dose: "75 mg", scheduled_time: "14:00:00", meal_relation: "after_meal", frequency: "Once Daily", active: true, created_at: "2026-06-01T00:00:00.000Z" },
  { id: "m-atorvastatin", medicine_name: "Atorvastatin", dose: "20 mg", scheduled_time: "21:00:00", meal_relation: "after_meal", frequency: "Once Daily", active: true, created_at: "2026-06-01T00:00:00.000Z" },
];

const MEALS_LIGHT: Array<{ meal: string; time: string; items: Array<[string, number, number, number, number, number, number | null]> }> = [
  { meal: "breakfast", time: "08:30", items: [["Roti", 2, 210, 6, 42, 3, 300], ["Moong dal", 1, 140, 9, 22, 1, 200]] },
  { meal: "lunch", time: "13:30", items: [["Roti", 2, 210, 6, 42, 3, 300], ["Lauki sabzi", 1, 90, 2, 12, 3, 250], ["Dal", 1, 160, 9, 24, 4, 350]] },
  { meal: "snack", time: "17:00", items: [["Chai", 1, 80, 2, 12, 0, 40]] },
  { meal: "dinner", time: "20:00", items: [["Roti", 2, 210, 6, 42, 3, 300], ["Bhindi sabzi", 1, 110, 2, 10, 4, 260]] },
];

const MEALS_SALTY: typeof MEALS_LIGHT = [
  { meal: "breakfast", time: "08:30", items: [["Paratha with ghee", 2, 420, 8, 50, 3, 700], ["Achar", 1, 60, 0, 4, 1, 400]] },
  { meal: "lunch", time: "13:30", items: [["Puri", 4, 520, 8, 60, 3, 600], ["Aloo sabzi", 1, 220, 3, 30, 3, 800], ["Papad", 2, 90, 4, 12, 1, 500]] },
  { meal: "snack", time: "17:00", items: [["Pakora fried", 6, 420, 7, 36, 3, 900], ["Namkeen", 1, 160, 4, 14, 2, 450]] },
  { meal: "dinner", time: "20:00", items: [["Roti", 3, 315, 9, 63, 4, 450], ["Dal fry", 1, 240, 10, 26, 4, 900]] },
];

function rawFor(p: Profile, opts: { withMedicines: boolean }): RawPatientData {
  const rng = mulberry32(p.seed);
  const bp: BPRow[] = [];
  const weight: WeightRow[] = [];
  const food: FoodRow[] = [];
  const sleep: SleepRow[] = [];
  const activity: ActivityRow[] = [];
  const logs: MedicineLogRow[] = [];

  const nowHHMM = "09:30";
  for (let daysAgo = p.history - 1; daysAgo >= 0; daysAgo--) {
    const date = addDaysIST(FIXTURE_TODAY, -daysAgo);
    const idx = p.history - 1 - daysAgo;

    if (rng() < p.bpDayChance) {
      const times = daysAgo === 0 ? ["08:05"] : ["08:05", "19:10"];
      for (const t of times) {
        const sys = Math.round(gaussian(rng, p.bpSys(idx, daysAgo), 4));
        const dia = Math.round(gaussian(rng, p.bpDia(idx, daysAgo), 3));
        bp.push({ systolic: sys, diastolic: Math.min(dia, sys - 20), pulse: Math.round(gaussian(rng, 72, 4)), reading_type: t < "12:00" ? "morning" : "evening", measured_at: iso(date, t), notes: null });
      }
    }
    if (p.weightLogs && idx % 2 === 0) {
      weight.push({ weight_kg: Math.round((p.weightStart + p.weightDrift * idx + gaussian(rng, 0, 0.15)) * 10) / 10, measured_at: iso(date, "07:00"), notes: null });
    }
    if (p.food !== "none") {
      for (const m of p.food === "salty" ? MEALS_SALTY : MEALS_LIGHT) {
        if (daysAgo === 0 && m.time > nowHHMM) continue;
        for (const [name, qty, kcal, prot, carb, fat, sodium] of m.items) {
          food.push({ meal_type: m.meal, food_name: name, quantity: qty, unit: "pcs", calories: kcal, protein_g: prot, carbs_g: carb, fat_g: fat, fibre_g: 2, sodium_mg: sodium, consumed_at: iso(date, m.time) });
        }
      }
    }
    if (p.sleepLogs && daysAgo !== 0) sleep.push({ date, sleep_hours: Math.max(3, Math.round(gaussian(rng, p.sleepMean, 0.6) * 10) / 10), bedtime: "22:30", wake_time: "05:30" });
    if (p.stepLogs && daysAgo !== 0) {
      const steps = Math.max(300, Math.round(gaussian(rng, p.stepsMean, 1000)));
      activity.push({ date, steps, distance_km: Math.round(steps * 0.00075 * 10) / 10, walking_minutes: Math.round(steps / 100), estimated_calories_burned: Math.round(steps * 0.04) });
    }
    if (opts.withMedicines) {
      for (const med of MEDS) {
        const sched = med.scheduled_time.slice(0, 5);
        if (daysAgo === 0 && sched > nowHHMM) continue;
        const r = rng();
        const a = p.adherence(daysAgo);
        if (r < a.taken) logs.push({ medicine_id: med.id, scheduled_time: iso(date, sched), taken_time: iso(date, sched), status: "taken" });
        else if (r < a.taken + a.late) logs.push({ medicine_id: med.id, scheduled_time: iso(date, sched), taken_time: iso(date, `${String(Math.min(23, Number(sched.slice(0, 2)) + 3)).padStart(2, "0")}:30`), status: "late" });
        // else: no log row; the engine counts it missed after the 240-minute window
      }
    }
  }

  return {
    patientId: "00000000-0000-4000-8000-000000000001",
    now: FIXTURE_NOW,
    days: 120,
    patient: { age: 67, gender: "male", height_cm: 168, current_weight_kg: p.weightStart, target_weight_kg: 72, daily_calorie_target: 1600 },
    settings: { daily_calorie_target: 1600, daily_step_goal: 6000, sleep_target_hours: 7, bp_targets: null },
    conditions: [
      { condition_name: "Hypertension", diagnosed_year: 2018, notes: null },
      { condition_name: "Stroke (history)", diagnosed_year: 2023, notes: null },
    ],
    medicines: opts.withMedicines ? MEDS : [],
    memories: [],
    bp,
    weight,
    food,
    sleep,
    activity,
    medicineLogs: logs,
    truncated: {},
    feedbackNotes: [],
  };
}

const BASE: Profile = {
  seed: 7,
  history: 100,
  bpSys: () => 122,
  bpDia: () => 74,
  bpDayChance: 0.95,
  food: "light",
  sleepMean: 7,
  stepsMean: 5500,
  weightStart: 80,
  weightDrift: -0.01,
  adherence: () => ({ taken: 0.96, late: 0.03 }),
  sleepLogs: true,
  stepLogs: true,
  weightLogs: true,
};

export function makeFixture(id: ArchetypeId): PatientContext {
  switch (id) {
    case "steady":
      return buildContext(rawFor(BASE, { withMedicines: true }));
    case "crisis": {
      const raw = rawFor(
        {
          ...BASE,
          seed: 11,
          bpSys: (_i, ago) => (ago <= 6 ? 150 + (6 - ago) * 3 : 130),
          bpDia: (_i, ago) => (ago <= 6 ? 92 + (6 - ago) : 82),
          adherence: (ago) => (ago <= 2 ? { taken: 0.3, late: 0.1 } : { taken: 0.95, late: 0.03 }),
        },
        { withMedicines: true },
      );
      // This morning's reading, in the crisis range (replaces the generated one).
      raw.bp = raw.bp.filter((r) => !r.measured_at.startsWith("2026-10-04"));
      raw.bp.push({ systolic: 188, diastolic: 122, pulse: 96, reading_type: "morning", measured_at: iso(FIXTURE_TODAY, "07:40"), notes: null });
      return buildContext(raw);
    }
    case "sparse": {
      const raw = rawFor({ ...BASE, seed: 3, food: "none", sleepLogs: false, stepLogs: false, weightLogs: false, history: 1 }, { withMedicines: false });
      raw.bp = [
        { systolic: 142, diastolic: 90, pulse: 76, reading_type: "morning", measured_at: iso("2026-09-25", "08:10"), notes: null },
        { systolic: 138, diastolic: 88, pulse: 74, reading_type: "evening", measured_at: iso("2026-09-26", "19:00"), notes: null },
        { systolic: 146, diastolic: 92, pulse: 78, reading_type: "morning", measured_at: iso("2026-09-28", "08:20"), notes: null },
      ];
      raw.weight = [{ weight_kg: 79.5, measured_at: iso("2026-09-14", "07:00"), notes: null }];
      raw.activity = [
        { date: "2026-09-27", steps: 2100, distance_km: 1.6, walking_minutes: 21, estimated_calories_burned: 84 },
        { date: "2026-09-28", steps: 2600, distance_km: 2, walking_minutes: 26, estimated_calories_burned: 104 },
      ];
      return buildContext(raw);
    }
    case "missed_meds":
      return buildContext(
        rawFor(
          {
            ...BASE,
            seed: 21,
            bpSys: (_i, ago) => (ago <= 30 ? 139 : 128),
            bpDia: (_i, ago) => (ago <= 30 ? 88 : 80),
            adherence: (ago) => (ago <= 29 ? { taken: 0.4, late: 0.1 } : { taken: 0.92, late: 0.05 }),
          },
          { withMedicines: true },
        ),
      );
    case "high_sodium":
      return buildContext(
        rawFor(
          { ...BASE, seed: 31, bpSys: () => 148, bpDia: () => 94, food: "salty", sleepMean: 5.5, stepsMean: 3000, weightStart: 84, weightDrift: 0.02, adherence: () => ({ taken: 0.85, late: 0.08 }) },
          { withMedicines: true },
        ),
      );
    case "empty":
      return buildContext({
        ...rawFor({ ...BASE, history: 0 }, { withMedicines: false }),
        conditions: [],
        patient: { age: 67, gender: "male", height_cm: 168, current_weight_kg: null, target_weight_kg: null, daily_calorie_target: 1600 },
      });
  }
}

let cache: Partial<Record<ArchetypeId, PatientContext>> = {};
export function fixture(id: ArchetypeId): PatientContext {
  cache[id] ??= makeFixture(id);
  return cache[id]!;
}
export function clearFixtureCache() {
  cache = {};
}
