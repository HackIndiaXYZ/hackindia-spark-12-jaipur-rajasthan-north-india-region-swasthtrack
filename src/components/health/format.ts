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
export function fmtDay(value: string | Date | number): string {
  return dayFmt.format(new Date(value));
}

/** "4 Oct 2026" for an instant. */
export function fmtDayYear(value: string | Date | number): string {
  return dayYearFmt.format(new Date(value));
}

/** "8:30 am" for an instant. */
export function fmtTime(value: string | Date | number): string {
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

const weekdayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, weekday: "short" });

/** "Sat" for a date string. */
export function fmtWeekdayShort(dateStr: string): string {
  return weekdayFmt.format(noonIST(dateStr));
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

const monthYearFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, month: "short", year: "2-digit" });

/** "Oct 26" for an instant: the x-axis label once a chart spans more than a few months. */
export function fmtMonthYear(value: string | Date | number): string {
  return monthYearFmt.format(new Date(value));
}

const yearShortFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, year: "2-digit" });

/** "4 Oct ’25": an axis label once a chart reaches across a new year. */
export function fmtDayYY(value: string | Date | number): string {
  const d = new Date(value);
  return `${dayFmt.format(d)} ’${yearShortFmt.format(d)}`;
}

/** "22:30" or "22:30:00" (a Postgres `time`) as "10:30 pm". Anything unparseable comes back unchanged. */
export function fmtClock(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${m[2]} ${suffix}`;
}

/** A stored number for display with at most `digits` decimals and no float noise (7.5, not 7.500000001). */
export function fmtNum(value: number | string | null | undefined, digits = 1): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const f = 10 ** digits;
  return String(Math.round(n * f) / f);
}

/** A typed decimal ("78.4", "78." or ".5"); NaN for anything else, including an empty box. */
export function parseDecimalInput(raw: string): number {
  const s = raw.trim();
  return /^(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : NaN;
}

/** A typed whole number; NaN for anything else, including an empty box. */
export function parseIntegerInput(raw: string): number {
  const s = raw.trim();
  return /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
}
