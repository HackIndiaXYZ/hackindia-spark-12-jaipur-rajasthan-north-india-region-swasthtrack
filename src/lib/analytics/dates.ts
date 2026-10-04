/**
 * Pure IST date-window helpers shared by the analytics services. Every window is
 * made of IST calendar dates ("YYYY-MM-DD"), never of "now - N x 24h".
 */
import { addDaysIST, toISTDate, todayIST } from "../health-rules";

export interface DateWindow {
  /** Inclusive IST dates. */
  start: string;
  end: string;
  days: number;
}

/** The `days` days ending on `endDate` (default today), inclusive. */
export function recentWindow(days: number, endDate: string = todayIST()): DateWindow {
  return { start: addDaysIST(endDate, -(days - 1)), end: endDate, days };
}

/** The `days` days immediately before `recentWindow(days, endDate)`. */
export function priorWindow(days: number, endDate: string = todayIST()): DateWindow {
  const recent = recentWindow(days, endDate);
  const end = addDaysIST(recent.start, -1);
  return { start: addDaysIST(end, -(days - 1)), end, days };
}

export function inWindow(date: string, w: Pick<DateWindow, "start" | "end">): boolean {
  return date >= w.start && date <= w.end;
}

/** IST date of a timestamp, tolerating missing values. */
export function dayOfTs(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : toISTDate(d);
}

export function groupByDay<T>(rows: T[], getDay: (row: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const day = getDay(row);
    if (!day) continue;
    const list = out.get(day);
    if (list) list.push(row);
    else out.set(day, [row]);
  }
  return out;
}

export function filterWindow<T>(rows: T[], getDay: (row: T) => string | null, w: Pick<DateWindow, "start" | "end">): T[] {
  return rows.filter((r) => {
    const d = getDay(r);
    return d !== null && inWindow(d, w);
  });
}

/** Whole days since `date` as seen from `today` (0 = today). */
export function ageInDays(date: string, today: string = todayIST()): number {
  const [ay, am, ad] = date.split("-").map(Number);
  const [by, bm, bd] = today.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}
