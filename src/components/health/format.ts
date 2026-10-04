import { IST_TZ, todayIST, addDaysIST } from "@/lib/health-rules";

/**
 * Display formatting in India time. Every "day" a reader sees is an IST
 * calendar day, whatever timezone the phone is set to.
 */

const dayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, day: "numeric", month: "short" });
const dayYearFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const weekdayDayFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const fullFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "4 Oct" for an instant. */
export function fmtDay(value: string | Date): string {
  return dayFmt.format(new Date(value));
}

/** "4 Oct 2026" for an instant. */
export function fmtDayYear(value: string | Date): string {
  return dayYearFmt.format(new Date(value));
}

/** "8:30 am" for an instant. */
export function fmtTime(value: string | Date): string {
  return timeFmt.format(new Date(value)).toLowerCase();
}

/** Anchor a "YYYY-MM-DD" at IST noon so formatting can never slip a day. */
function noonIST(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00+05:30`);
}

/** "4 Oct" for a date string. */
export function fmtDateStr(dateStr: string): string {
  return dayFmt.format(noonIST(dateStr));
}

/** "4 Oct 2026" for a date string. */
export function fmtDateStrYear(dateStr: string): string {
  return dayYearFmt.format(noonIST(dateStr));
}

/** "Sat, 4 Oct" for a date string. */
export function fmtDateStrWeekday(dateStr: string): string {
  return weekdayDayFmt.format(noonIST(dateStr));
}

/** "Saturday, 4 October 2026" for a date string. */
export function fmtDateStrFull(dateStr: string): string {
  return fullFmt.format(noonIST(dateStr));
}

/** "आज" / "कल" / "4 Oct" for a date string. */
export function relativeDayLabel(dateStr: string, today: string = todayIST()): string {
  if (dateStr === today) return "आज";
  if (dateStr === addDaysIST(today, -1)) return "कल";
  return fmtDateStr(dateStr);
}

/** "YYYY-MM-DD" and "HH:MM" (IST) of an instant, for date/time inputs. */
export function istDateAndTime(value: string | Date): { date: string; time: string } {
  const d = new Date(value);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: IST_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date, time: time === "24:00" ? "00:00" : time };
}

/** A stored kilogram value for display: at most 2 decimals, no float noise (74.46000000000001 → 74.46). */
export function fmtKg(value: number | string | null | undefined): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—";
}
