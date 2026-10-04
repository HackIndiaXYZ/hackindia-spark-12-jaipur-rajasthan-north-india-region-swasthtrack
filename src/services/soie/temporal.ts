/**
 * Temporal resolver (IST). PURE.
 *
 * Turns "kal", "परसों", "pichle 7 din", "last week", "is mahine", "somvar",
 * "15 August", "04/10", "2026-10-04", "1 se 7 October" ... into explicit,
 * validated IST calendar spans, always relative to a `today` the caller passes.
 *
 * What the old resolver got wrong and this one does not:
 *  - "kal" is matched as a WHOLE TOKEN inside the sentence, with tense markers
 *    deciding yesterday vs tomorrow (it used to need the whole sentence to be "kal");
 *  - impossible dates (31 Feb) are reported, never silently shifted;
 *  - every result carries a human label so the answer can state the dates it used.
 */

import { addDaysIST, daysBetweenIST } from "@/lib/health-rules";
import { fold } from "./normalize";

export interface Span {
  from: string;
  to: string;
  days: number;
  kind: "day" | "range";
  labelEn: string;
  labelHi: string;
  /** The words in the question this span came from (folded). */
  matched: string;
  /** Interpretation the user should be told about ("kal = yesterday"). */
  note?: string;
  /** Extends past today: there can be no data for it yet. */
  future?: boolean;
}

export interface TemporalResult {
  spans: Span[];
  /** Impossible calendar dates the user wrote, e.g. "31/02". */
  invalid: string[];
  explicit: boolean;
  /** The folded text with every matched time expression blanked out (used by verify.ts to find the OTHER numbers). */
  remainder: string;
}

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

export function isValidYMD(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Day of week, Monday = 0 ... Sunday = 6. */
export function weekdayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

const WEEKDAYS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAYS_HI = ["सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार", "रविवार"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];

export function formatDateEn(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${WEEKDAYS_EN[weekdayIndex(dateStr)].slice(0, 3)} ${d} ${MONTHS_EN[m - 1].slice(0, 3)} ${y}`;
}

export function formatDateHi(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS_HI[m - 1]} ${y}`;
}

export function weekdayHi(dateStr: string): string {
  return WEEKDAYS_HI[weekdayIndex(dateStr)];
}

export function startOfISOWeek(dateStr: string): string {
  return addDaysIST(dateStr, -weekdayIndex(dateStr));
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return ymd(ny, nm, Math.min(d, dim));
}

function daySpan(date: string, today: string, matched: string, note?: string): Span {
  return {
    from: date,
    to: date,
    days: 1,
    kind: "day",
    labelEn: formatDateEn(date),
    labelHi: formatDateHi(date),
    matched,
    note,
    future: date > today,
  };
}

function rangeSpan(from: string, to: string, today: string, matched: string, note?: string): Span {
  if (from > to) [from, to] = [to, from];
  const days = daysBetweenIST(from, to) + 1;
  return {
    from,
    to,
    days,
    kind: days === 1 ? "day" : "range",
    labelEn: from === to ? formatDateEn(from) : `${formatDateEn(from)} – ${formatDateEn(to)}`,
    labelHi: from === to ? formatDateHi(from) : `${formatDateHi(from)} – ${formatDateHi(to)}`,
    matched,
    note,
    future: to > today,
  };
}

// ---------------------------------------------------------------------------
// Vocabulary (folded at load)
// ---------------------------------------------------------------------------

const f = (words: string[]) => words.map((w) => fold(w));

const MONTH_NAMES: Record<string, number> = {};
function addMonthNames(names: string[], month: number) {
  for (const n of names) MONTH_NAMES[fold(n)] = month;
}
addMonthNames(["january", "jan", "जनवरी"], 1);
addMonthNames(["february", "feb", "फरवरी", "फ़रवरी"], 2);
addMonthNames(["march", "mar", "मार्च"], 3);
addMonthNames(["april", "apr", "अप्रैल"], 4);
addMonthNames(["may", "मई"], 5);
addMonthNames(["june", "jun", "जून"], 6);
addMonthNames(["july", "jul", "जुलाई"], 7);
addMonthNames(["august", "aug", "अगस्त"], 8);
addMonthNames(["september", "sept", "sep", "सितंबर", "सितम्बर"], 9);
addMonthNames(["october", "oct", "अक्टूबर", "अक्तूबर"], 10);
addMonthNames(["november", "nov", "नवंबर", "नवम्बर"], 11);
addMonthNames(["december", "dec", "दिसंबर", "दिसम्बर"], 12);

const MONTH_ALT = Object.keys(MONTH_NAMES)
  .sort((a, b) => b.length - a.length)
  .join("|");

const WEEKDAY_NAMES: Record<string, number> = {};
function addWeekday(names: string[], idx: number) {
  for (const n of names) WEEKDAY_NAMES[fold(n)] = idx;
}
// Short English forms ("sat", "sun", "mon") are deliberately absent: "sat" is a verb.
addWeekday(["monday", "somvar", "somwar", "सोमवार"], 0);
addWeekday(["tuesday", "mangalvar", "mangalwar", "मंगलवार"], 1);
addWeekday(["wednesday", "budhvar", "budhwar", "बुधवार"], 2);
addWeekday(["thursday", "guruvar", "guruwar", "brihaspativar", "vrihaspativar", "गुरुवार", "बृहस्पतिवार", "वीरवार"], 3);
addWeekday(["friday", "shukravar", "shukrawar", "शुक्रवार"], 4);
addWeekday(["saturday", "shanivar", "shaniwar", "शनिवार"], 5);
addWeekday(["sunday", "ravivar", "raviwar", "itwar", "इतवार", "रविवार"], 6);
const WEEKDAY_ALT = Object.keys(WEEKDAY_NAMES)
  .sort((a, b) => b.length - a.length)
  .join("|");

const PREFIX = f(["pichle", "pichhle", "pichla", "pichli", "pichhli", "pehle", "last", "past", "previous", "purane", "पिछले", "पिछली", "पिछला"]).join("|");
const UNIT_DAY = f(["din", "dino", "dinon", "days", "day", "दिन", "दिनों"]).join("|");
const UNIT_WEEK = f(["hafte", "hafta", "haftey", "haphte", "weeks", "week", "saptah", "हफ्ते", "हफ्ता", "सप्ताह", "हफ्तों"]).join("|");
const UNIT_MONTH = f(["mahine", "mahina", "mahinon", "months", "month", "महीने", "महीना", "महीनों"]).join("|");
const UNIT_ANY = `${UNIT_DAY}|${UNIT_WEEK}|${UNIT_MONTH}`;
const AGO = f(["pehle", "pahle", "ago", "पहले"]).join("|");
const RANGE_CONNECTOR = new Set(f(["to", "se", "till", "until", "tak", "and", "से", "तक", "-", "–", "se lekar", "से लेकर", "ke beech", "between"]));

const NAMED: Array<{ words: string[]; make: (today: string, matched: string) => Span }> = [
  {
    words: ["is hafte", "iss hafte", "is hafta", "iss hafta", "is saptah", "this week", "is week", "iss week", "इस हफ्ते", "इस सप्ताह", "इस हफ्ता", "ye hafta", "yeh hafta"],
    make: (t, m) => rangeSpan(startOfISOWeek(t), t, t, m, "सप्ताह सोमवार से शुरू (Week starts Monday)"),
  },
  {
    words: ["pichle hafte", "pichhle hafte", "pichla hafta", "pichhla hafta", "pichle week", "pichhle week", "pichle saptah", "last week", "previous week", "पिछले हफ्ते", "पिछले सप्ताह", "पिछला हफ्ता", "पिछला सप्ताह"],
    make: (t, m) => {
      const s = addDaysIST(startOfISOWeek(t), -7);
      return rangeSpan(s, addDaysIST(s, 6), t, m, "पिछला पूरा सप्ताह, सोमवार से रविवार (Previous Monday-Sunday week)");
    },
  },
  {
    words: ["is mahine", "iss mahine", "is mahina", "iss mahina", "this month", "is month", "इस महीने", "इस महीना", "ye mahina", "yeh mahina"],
    make: (t, m) => rangeSpan(`${t.slice(0, 7)}-01`, t, t, m, "महीने की 1 तारीख़ से आज तक (Month to date)"),
  },
  {
    words: ["pichle mahine", "pichhle mahine", "pichla mahina", "pichhla mahina", "pichle month", "last month", "previous month", "पिछले महीने", "पिछला महीना"],
    make: (t, m) => {
      const first = addMonths(`${t.slice(0, 7)}-01`, -1);
      const lastDay = addDaysIST(`${t.slice(0, 7)}-01`, -1);
      return rangeSpan(first, lastDay, t, m, "पिछला पूरा कैलेंडर महीना (Previous calendar month)");
    },
  },
  { words: ["aaj", "aj", "today", "todays", "आज"], make: (t, m) => daySpan(t, t, m) },
  { words: ["yesterday", "beete kal", "बीते कल"], make: (t, m) => daySpan(addDaysIST(t, -1), t, m) },
  { words: ["day before yesterday"], make: (t, m) => daySpan(addDaysIST(t, -2), t, m) },
  { words: ["tomorrow"], make: (t, m) => daySpan(addDaysIST(t, 1), t, m) },
  { words: ["narso", "narson", "नरसों"], make: (t, m) => daySpan(addDaysIST(t, -3), t, m) },
];

const PAST_MARKERS = new Set(
  f([
    "tha", "thi", "the", "kiya", "khaya", "khayi", "khaye", "liya", "li", "hua", "hui", "huye", "raha", "rahi", "rahe", "gaya", "gayi", "gaye",
    "was", "did", "were", "had", "ate", "took", "slept", "walked", "measured", "था", "थी", "थे", "किया", "खाया", "खाई",
    "लिया", "ली", "हुआ", "हुई", "रहा", "रही", "रहे", "गया", "गई", "सोया", "चला",
  ]),
);
const FUTURE_MARKERS = new Set(
  f([
    "hoga", "hogi", "honge", "karna", "karenge", "karunga", "karungi", "chahiye", "lena", "jana", "jaana", "will", "shall",
    "tomorrow", "होगा", "होगी", "होंगे", "करना", "करेंगे", "चाहिए", "लेना", "जाना",
  ]),
);

function tenseOf(tokens: string[]): "past" | "future" | "unknown" {
  const past = tokens.some((t) => PAST_MARKERS.has(t));
  const future = tokens.some((t) => FUTURE_MARKERS.has(t));
  if (future && !past) return "future";
  if (past && !future) return "past";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

interface Hit {
  start: number;
  end: number;
  span: Span;
  /** Explicit calendar date (eligible for "X to Y" merging). */
  explicitDate: boolean;
}

function boundaryRe(pattern: string): RegExp {
  return new RegExp(`(^|\\s)(?:${pattern})(?=\\s|$)`, "g");
}

export function resolveTemporal(text: string, today: string): TemporalResult {
  const folded = fold(text);
  const tokens = folded ? folded.split(" ") : [];
  const tense = tenseOf(tokens);
  let work = folded;
  const hits: Hit[] = [];
  const invalid: string[] = [];

  const [ty] = today.split("-").map(Number);

  function blank(start: number, end: number) {
    work = work.slice(0, start) + " ".repeat(end - start) + work.slice(end);
  }

  function scan(re: RegExp, handler: (m: RegExpExecArray) => { span: Span; explicitDate?: boolean } | null) {
    const snapshot = work;
    re.lastIndex = 0;
    const found: Array<{ start: number; end: number; res: { span: Span; explicitDate?: boolean } | null }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(snapshot)) !== null) {
      const start = m.index + m[1].length;
      const end = m.index + m[0].length;
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const res = handler(m);
      // Whether valid or not, consume the text so later patterns do not re-read it.
      found.push({ start, end, res });
    }
    for (const x of found) {
      blank(x.start, x.end);
      if (x.res) hits.push({ start: x.start, end: x.end, span: x.res.span, explicitDate: Boolean(x.res.explicitDate) });
    }
  }

  const matchedText = (m: RegExpExecArray) => m[0].trim();

  function resolveDate(y: number | null, mo: number, d: number, raw: string): Span | null {
    let year = y;
    let note: string | undefined;
    if (year === null) {
      year = ty;
      if (isValidYMD(year, mo, d) && ymd(year, mo, d) > today) {
        year = ty - 1;
        note = "साल नहीं बताया, इसलिए पिछला साल माना (year not given; assumed the previous year)";
      }
    } else if (year < 100) {
      year += 2000;
    }
    if (!isValidYMD(year, mo, d)) {
      invalid.push(raw);
      return null;
    }
    return daySpan(ymd(year, mo, d), today, raw, note);
  }

  // 1. "1 se 7 october", "1-7 oct", "1 to 7 october"
  scan(boundaryRe(`(\\d{1,2})\\s*(?:se|to|till|tak|-|से|तक)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})(?:\\s+(\\d{4}))?`), (m) => {
    const mo = MONTH_NAMES[m[4]];
    // One year for both ends: judged by the START of the range, so "1 se 7 october"
    // asked on 4 Oct means this October (the end is simply in the future).
    const startThisYear = isValidYMD(ty, mo, Number(m[2])) ? ymd(ty, mo, Number(m[2])) : null;
    const y = m[5] ? Number(m[5]) : startThisYear && startThisYear > today ? ty - 1 : ty;
    const a = resolveDate(y, mo, Number(m[2]), matchedText(m));
    const b = resolveDate(y, mo, Number(m[3]), matchedText(m));
    if (!a || !b) return null;
    return { span: rangeSpan(a.from, b.to, today, matchedText(m), a.note) };
  });

  // 2. ISO date
  scan(boundaryRe("(\\d{4})-(\\d{1,2})-(\\d{1,2})"), (m) => {
    const s = resolveDate(Number(m[2]), Number(m[3]), Number(m[4]), matchedText(m));
    return s ? { span: s, explicitDate: true } : null;
  });

  // 3. DD/MM/YYYY or DD-MM-YYYY
  scan(boundaryRe("(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4})"), (m) => {
    const s = resolveDate(Number(m[4]), Number(m[3]), Number(m[2]), matchedText(m));
    return s ? { span: s, explicitDate: true } : null;
  });

  // 4. DD/MM (day first, the Indian convention)
  scan(boundaryRe("(\\d{1,2})/(\\d{1,2})"), (m) => {
    // "130/80" is a blood pressure, not a date: only day <= 31 and month <= 12 are candidates.
    if (Number(m[2]) > 31 || Number(m[3]) > 12) return null;
    const s = resolveDate(null, Number(m[3]), Number(m[2]), matchedText(m));
    return s ? { span: s, explicitDate: true } : null;
  });

  // 5. "15 august [2026]" / "15th of august"
  scan(boundaryRe(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})(?:\\s+(\\d{4}))?`), (m) => {
    const s = resolveDate(m[4] ? Number(m[4]) : null, MONTH_NAMES[m[3]], Number(m[2]), matchedText(m));
    return s ? { span: s, explicitDate: true } : null;
  });

  // 6. "august 15 [2026]"
  scan(boundaryRe(`(${MONTH_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`), (m) => {
    const s = resolveDate(m[4] ? Number(m[4]) : null, MONTH_NAMES[m[2]], Number(m[3]), matchedText(m));
    return s ? { span: s, explicitDate: true } : null;
  });

  // 7. "3 din pehle" / "3 days ago"
  scan(boundaryRe(`(\\d{1,3})\\s+(${UNIT_DAY})\\s+(?:${AGO})`), (m) => {
    const n = Number(m[2]);
    if (n < 0 || n > 3650) return null;
    return { span: daySpan(addDaysIST(today, -n), today, matchedText(m)) };
  });

  // 8. "pichle 7 din", "last 2 weeks", "past 1 month", and bare "7 din"/"7 days"
  scan(boundaryRe(`(?:(?:${PREFIX})\\s+(?:the\\s+)?)?(\\d{1,3})\\s+(${UNIT_ANY})`), (m) => {
    const n = Number(m[2]);
    const unit = m[3];
    if (!(n >= 1)) return null;
    let from: string;
    if (UNIT_DAY.split("|").includes(unit)) from = addDaysIST(today, -(n - 1));
    else if (UNIT_WEEK.split("|").includes(unit)) from = addDaysIST(today, -(n * 7 - 1));
    else from = addDaysIST(addMonths(today, -n), 1);
    return { span: rangeSpan(from, today, today, matchedText(m), "आज सहित (including today)") };
  });

  // 9. Named windows and days
  for (const entry of NAMED) {
    const alt = f(entry.words).join("|");
    scan(boundaryRe(alt), (m) => ({ span: entry.make(today, matchedText(m)) }));
  }

  // 10. kal / parso: tense decides yesterday vs tomorrow
  scan(boundaryRe(f(["kal", "कल"]).join("|")), (m) => {
    if (tense === "future") return { span: daySpan(addDaysIST(today, 1), today, matchedText(m), "'कल' = आने वाला कल (tomorrow)") };
    return {
      span: daySpan(addDaysIST(today, -1), today, matchedText(m), tense === "past" ? undefined : "'कल' = बीता हुआ कल (yesterday) माना गया"),
    };
  });
  scan(boundaryRe(f(["parso", "parson", "परसों", "parson ko"]).join("|")), (m) => {
    if (tense === "future") return { span: daySpan(addDaysIST(today, 2), today, matchedText(m), "'परसों' = आने वाला परसों (day after tomorrow)") };
    return {
      span: daySpan(addDaysIST(today, -2), today, matchedText(m), tense === "past" ? undefined : "'परसों' = बीता हुआ परसों माना गया"),
    };
  });

  // 11. Weekdays (optionally "last <weekday>")
  scan(boundaryRe(`(?:(${PREFIX})\\s+)?(${WEEKDAY_ALT})`), (m) => {
    const idx = WEEKDAY_NAMES[m[3]];
    const todayIdx = weekdayIndex(today);
    let back = (todayIdx - idx + 7) % 7;
    if (m[2] && back === 0) back = 7;
    const note = back === 0 ? undefined : `सबसे हाल का ${WEEKDAYS_HI[idx]} माना गया (most recent ${WEEKDAYS_EN[idx]})`;
    return { span: daySpan(addDaysIST(today, -back), today, matchedText(m), note) };
  });

  // Merge "X to Y" between two explicit dates.
  hits.sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i];
    const next = hits[i + 1];
    if (cur.explicitDate && next && next.explicitDate) {
      const between = fold(folded.slice(cur.end, next.start));
      const connectorOk =
        between.length > 0 &&
        (RANGE_CONNECTOR.has(between) ||
          between.split(" ").every((w) => RANGE_CONNECTOR.has(w) || w === "from" || w === "ke" || w === "ko" || w === "tak"));
      // allow a leading "from" before the first date to be ignored (it is outside the slice)
      if (connectorOk) {
        merged.push(rangeSpan(cur.span.from, next.span.to, today, `${cur.span.matched} ${between} ${next.span.matched}`));
        i++;
        continue;
      }
    }
    merged.push(cur.span);
  }

  return { spans: merged, invalid, explicit: merged.length > 0 || invalid.length > 0, remainder: work.replace(/\s+/g, " ").trim() };
}

/** The span's overlap with [from, to]; null when disjoint. */
export function clampSpan(span: { from: string; to: string }, from: string, to: string): { from: string; to: string } | null {
  const a = span.from > from ? span.from : from;
  const b = span.to < to ? span.to : to;
  return a > b ? null : { from: a, to: b };
}
