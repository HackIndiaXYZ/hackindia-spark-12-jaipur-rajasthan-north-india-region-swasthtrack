/**
 * One place where the analytics services read their raw series.
 *
 * Each series is fetched ONCE per service call for a date window (IST, inclusive)
 * big enough for both the recent and the reference period, using patient-service's
 * range readers (they sit behind a short shared cache, so concurrent services
 * reuse the same response instead of each hitting the database).
 */
import {
  getActivityLogsInRange,
  getBloodPressureLogsInRange,
  getFoodLogsInRange,
  getMedicineLogsInRange,
  getMedicines,
  getSleepLogsInRange,
  getWeightLogsInRange,
} from "./patient-service";
import type {
  ActivityLogEntry,
  BPLogEntry,
  FoodLogEntry,
  MedicineItem,
  MedicineLogEntry,
  SleepLogEntry,
  WeightLogEntry,
} from "./patient-service";
import { addDaysIST, toISTDate } from "@/lib/health-rules";

export interface AnalyticsSeries {
  bp: BPLogEntry[];
  weight: WeightLogEntry[];
  food: FoodLogEntry[];
  sleep: SleepLogEntry[];
  activity: ActivityLogEntry[];
  /** Real medicine logs plus virtual auto-missed entries, ascending. */
  medicineLogs: MedicineLogEntry[];
  medicines: MedicineItem[];
}

export type SeriesKey = keyof AnalyticsSeries;

/**
 * Every "recent" analysis (score, anomalies, baseline, what-changed, briefs) asks
 * for a window ending today. They all read this same trailing window so the
 * services share one cached response per series instead of each issuing its own
 * differently-bounded request, then narrow to what they need.
 */
export const SHARED_WINDOW_DAYS = 60;

function narrow<T>(rows: T[], day: (r: T) => string, start: string, end: string): T[] {
  return rows.filter((r) => {
    const d = day(r);
    return d >= start && d <= end;
  });
}

/** Fetch the requested series for [startDate, endDate] (IST, inclusive) in parallel. */
export async function loadSeries<K extends SeriesKey>(
  patientId: string,
  startDate: string,
  endDate: string,
  keys: readonly K[],
): Promise<Pick<AnalyticsSeries, K>> {
  const want = new Set<SeriesKey>(keys);
  const today = toISTDate(new Date());
  const sharedStart = addDaysIST(today, -(SHARED_WINDOW_DAYS - 1));
  const useShared = endDate === today && startDate >= sharedStart;
  const from = useShared ? sharedStart : startDate;

  const [bp, weight, food, sleep, activity, medicineLogs, medicines] = await Promise.all([
    want.has("bp") ? getBloodPressureLogsInRange(patientId, from, endDate) : Promise.resolve([] as BPLogEntry[]),
    want.has("weight") ? getWeightLogsInRange(patientId, from, endDate) : Promise.resolve([] as WeightLogEntry[]),
    want.has("food") ? getFoodLogsInRange(patientId, from, endDate) : Promise.resolve([] as FoodLogEntry[]),
    want.has("sleep") ? getSleepLogsInRange(patientId, from, endDate) : Promise.resolve([] as SleepLogEntry[]),
    want.has("activity") ? getActivityLogsInRange(patientId, from, endDate) : Promise.resolve([] as ActivityLogEntry[]),
    want.has("medicineLogs") ? getMedicineLogsInRange(patientId, from, endDate) : Promise.resolve([] as MedicineLogEntry[]),
    want.has("medicines") || want.has("medicineLogs")
      ? getMedicines(patientId)
      : Promise.resolve([] as MedicineItem[]),
  ]);

  if (useShared && startDate > sharedStart) {
    return {
      bp: narrow(bp, bpDay, startDate, endDate),
      weight: narrow(weight, weightDay, startDate, endDate),
      food: narrow(food, foodDay, startDate, endDate),
      sleep: narrow(sleep, (r) => r.date, startDate, endDate),
      activity: narrow(activity, (r) => r.date, startDate, endDate),
      // buildDoseRecords bounds doses by date itself; trimming here by UTC date could drop an edge dose.
      medicineLogs,
      medicines,
    } as Pick<AnalyticsSeries, K>;
  }
  return { bp, weight, food, sleep, activity, medicineLogs, medicines } as Pick<AnalyticsSeries, K>;
}

export const bpDay = (r: BPLogEntry): string => toISTDate(r.measured_at || r.created_at);
export const weightDay = (r: WeightLogEntry): string => toISTDate(r.measured_at || r.created_at);
export const foodDay = (r: FoodLogEntry): string => toISTDate(r.consumed_at || r.created_at);
