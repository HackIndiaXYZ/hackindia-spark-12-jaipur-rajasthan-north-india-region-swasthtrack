/**
 * SwasthTrack Ask Mode — TemporalResolver (§6)
 * Pure TypeScript function resolving date phrases to exact ISO dates or ranges.
 * Implements strict distinction between rolling windows ([today-6, today])
 * and calendar windows (previous Mon-Sun calendar week).
 */

export type DateResolutionMethod =
  | "relative_day"
  | "rolling_window"
  | "calendar_window"
  | "explicit_date"
  | "failed";

export interface ResolvedTemporalWindow {
  date?: string; // YYYY-MM-DD
  range?: {
    start: string; // YYYY-MM-DD
    end: string;   // YYYY-MM-DD
    kind: "rolling" | "calendar";
  };
  method: DateResolutionMethod;
  labelHi: string;
  patientTimezone: string;
}

/**
 * Gets YYYY-MM-DD string in a specific timezone
 */
export function getFormattedDateInTZ(date: Date, tz = "Asia/Kolkata"): string {
  try {
    return date.toLocaleDateString("en-CA", { timeZone: tz });
  } catch {
    return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
}

// Month name -> 1-12, covering English (full + common abbreviations) and Hindi/Devanagari forms.
const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, "जनवरी": 1,
  feb: 2, february: 2, "फरवरी": 2,
  mar: 3, march: 3, "मार्च": 3,
  apr: 4, april: 4, "अप्रैल": 4,
  may: 5, "मई": 5,
  jun: 6, june: 6, "जून": 6,
  jul: 7, july: 7, "जुलाई": 7,
  aug: 8, august: 8, "अगस्त": 8,
  sep: 9, sept: 9, september: 9, "सितंबर": 9, "सितम्बर": 9,
  oct: 10, october: 10, "अक्टूबर": 10, "अक्तूबर": 10,
  nov: 11, november: 11, "नवंबर": 11, "नवम्बर": 11,
  dec: 12, december: 12, "दिसंबर": 12, "दिसम्बर": 12,
};

// Sorted longest-first so e.g. "september" is matched before "sep".
const MONTH_WORD_PATTERN = Object.keys(MONTH_NAMES)
  .sort((a, b) => b.length - a.length)
  .join("|");

function buildDateStr(dd: number, mm: number, yyyy: number): string | null {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * Resolves temporal phrase in patient's timezone
 */
export function resolveTemporal(
  phrase: string,
  patientTimezone = "Asia/Kolkata",
  nowUtc: Date = new Date()
): ResolvedTemporalWindow {
  const p = phrase.toLowerCase().trim();
  const tz = patientTimezone || "Asia/Kolkata";

  // Today in patient timezone
  const todayStr = getFormattedDateInTZ(nowUtc, tz);
  const [yr, mo, dy] = todayStr.split("-").map((num) => parseInt(num, 10));
  const todayObj = new Date(yr, mo - 1, dy);

  // Helper to subtract/add days
  const addDays = (d: Date, n: number) => {
    const res = new Date(d.getTime());
    res.setDate(res.getDate() + n);
    return getFormattedDateInTZ(res, tz);
  };

  // 1. RELATIVE DAYS
  if (p === "today" || p === "aaj" || p === "आज" || p === "abhi") {
    return {
      date: todayStr,
      method: "relative_day",
      labelHi: "आज (Today)",
      patientTimezone: tz,
    };
  }

  if (p === "yesterday" || p === "kal" || p === "कल") {
    const yestStr = addDays(todayObj, -1);
    return {
      date: yestStr,
      method: "relative_day",
      labelHi: "कल (Yesterday)",
      patientTimezone: tz,
    };
  }

  if (p === "parso" || p === "परसों") {
    const parsoStr = addDays(todayObj, -2);
    return {
      date: parsoStr,
      method: "relative_day",
      labelHi: "परसों",
      patientTimezone: tz,
    };
  }

  // 2. ROLLING WINDOWS ([today-(N-1), today])
  // Numeric-aware: captures the actual count instead of doing substring containment
  // (which previously made "17 days"/"27 days" falsely match "7 days"), and matches
  // the Devanagari unit word "दिन" alongside "din"/"days" so phrases like
  // "पिछले 7 दिन" resolve instead of silently falling through to the Today fallback.
  // NOTE: plain `\b` is ASCII-only (\w = [A-Za-z0-9_]) and never matches around
  // Devanagari characters, so the trailing boundary uses a Unicode-aware
  // lookahead/lookbehind instead — otherwise "दिन" (surrounded only by spaces, which
  // are also non-\w) would never satisfy `\b` and this would silently never match.
  const dayCountMatch = p.match(/(?<![\p{L}\p{N}_])(\d+)[\s_-]*(din|days?|दिन)(?![\p{L}\p{N}_])/u);
  if (dayCountMatch) {
    const n = parseInt(dayCountMatch[1], 10);
    if (n > 0) {
      const startStr = addDays(todayObj, -(n - 1));
      return {
        range: {
          start: startStr,
          end: todayStr,
          kind: "rolling",
        },
        method: "rolling_window",
        labelHi: `विगत ${n} दिन (Rolling ${n}D)`,
        patientTimezone: tz,
      };
    }
  }

  // 3. CALENDAR WINDOWS (Mon-Sun Calendar Week)
  if (
    p.includes("last week") ||
    p.includes("last_week") ||
    p.includes("pichle hafte") ||
    p.includes("pichle week") ||
    p.includes("पिछले हफ्ते") ||
    p.includes("पिछला हफ्ता") ||
    p.includes("पिछले सप्ताह")
  ) {
    // Determine current day of week (0 = Sun, 1 = Mon, ..., 6 = Sat)
    const dayOfWeek = todayObj.getDay();
    const daysSinceLastMon = (dayOfWeek + 6) % 7 + 7; // days to previous Monday
    const prevMonObj = new Date(todayObj.getTime());
    prevMonObj.setDate(prevMonObj.getDate() - daysSinceLastMon);

    const prevSunObj = new Date(prevMonObj.getTime());
    prevSunObj.setDate(prevSunObj.getDate() + 6);

    return {
      range: {
        start: getFormattedDateInTZ(prevMonObj, tz),
        end: getFormattedDateInTZ(prevSunObj, tz),
        kind: "calendar",
      },
      method: "calendar_window",
      labelHi: "पिछला हफ़्ता (Calendar Week: Mon-Sun)",
      patientTimezone: tz,
    };
  }

  if (
    p.includes("this week") ||
    p.includes("this_week") ||
    p.includes("is hafte") ||
    p.includes("is week") ||
    p.includes("इस हफ्ते") ||
    p.includes("इस सप्ताह")
  ) {
    const dayOfWeek = todayObj.getDay();
    const daysSinceMon = (dayOfWeek + 6) % 7;
    const monObj = new Date(todayObj.getTime());
    monObj.setDate(monObj.getDate() - daysSinceMon);

    return {
      range: {
        start: getFormattedDateInTZ(monObj, tz),
        end: todayStr,
        kind: "calendar",
      },
      method: "calendar_window",
      labelHi: "इस हफ़्ते (Current Week: Mon-Today)",
      patientTimezone: tz,
    };
  }

  // 4. EXPLICIT DATE PARSING ("27 August", "27/08/2026", "2026-08-27")
  const explicitIsoMatch = p.match(/\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (explicitIsoMatch) {
    return {
      date: explicitIsoMatch[0],
      method: "explicit_date",
      labelHi: explicitIsoMatch[0],
      patientTimezone: tz,
    };
  }

  // Numeric DD/MM[/YYYY] or DD-MM[-YYYY]
  const numericDateMatch = p.match(/\b([0-3]?\d)[\/\-]([01]?\d)(?:[\/\-](\d{4}))?\b/);
  if (numericDateMatch) {
    const dd = parseInt(numericDateMatch[1], 10);
    const mm = parseInt(numericDateMatch[2], 10);
    const yyyy = numericDateMatch[3] ? parseInt(numericDateMatch[3], 10) : yr;
    const dateStr = buildDateStr(dd, mm, yyyy);
    if (dateStr) {
      return {
        date: dateStr,
        method: "explicit_date",
        labelHi: dateStr,
        patientTimezone: tz,
      };
    }
  }

  // "15 August[ 2026]" / "15 अगस्त" (day-month[-year])
  // Uses a Unicode-aware boundary (see the day-count regex above) so Devanagari month
  // names like "अगस्त" — which plain `\b` cannot bound — are matched correctly.
  const dayMonthMatch = p.match(
    new RegExp(`(?<![\\p{L}\\p{N}_])([0-3]?\\d)\\s+(${MONTH_WORD_PATTERN})(?![\\p{L}\\p{N}_])(?:\\s+(\\d{4}))?`, "iu")
  );
  if (dayMonthMatch) {
    const dd = parseInt(dayMonthMatch[1], 10);
    const mm = MONTH_NAMES[dayMonthMatch[2].toLowerCase()];
    const yyyy = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : yr;
    const dateStr = mm ? buildDateStr(dd, mm, yyyy) : null;
    if (dateStr) {
      return {
        date: dateStr,
        method: "explicit_date",
        labelHi: dateStr,
        patientTimezone: tz,
      };
    }
  }

  // "August 15[, 2026]" (month-day[-year])
  const monthDayMatch = p.match(
    new RegExp(`(?<![\\p{L}\\p{N}_])(${MONTH_WORD_PATTERN})\\s+([0-3]?\\d)(?![\\p{L}\\p{N}_])(?:\\s*,?\\s*(\\d{4}))?`, "iu")
  );
  if (monthDayMatch) {
    const mm = MONTH_NAMES[monthDayMatch[1].toLowerCase()];
    const dd = parseInt(monthDayMatch[2], 10);
    const yyyy = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : yr;
    const dateStr = mm ? buildDateStr(dd, mm, yyyy) : null;
    if (dateStr) {
      return {
        date: dateStr,
        method: "explicit_date",
        labelHi: dateStr,
        patientTimezone: tz,
      };
    }
  }

  // Default Fallback: Today
  return {
    date: todayStr,
    method: "relative_day",
    labelHi: "आज (Today)",
    patientTimezone: tz,
  };
}
