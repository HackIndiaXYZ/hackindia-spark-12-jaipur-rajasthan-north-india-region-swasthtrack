/**
 * Hindi + English wording for dates, clock times, meals and roles used in e-mails.
 * Everything is computed in India time (Asia/Kolkata) from the shared helpers in
 * health-rules, so a server running in UTC prints the same thing a person in India sees.
 */
import { istMinutesOfDay, toISTDate } from "@/lib/health-rules";

/** A pair of the same text in Hindi and English. */
export interface Bi {
  hi: string;
  en: string;
}

export const bi = (b: Bi): string => `${b.hi} · ${b.en}`;

const HI_WEEKDAY = ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"];
const HI_WEEKDAY_SHORT = ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"];
const EN_WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HI_MONTH = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const HI_MONTH_SHORT = ["जन", "फ़र", "मार्च", "अप्रै", "मई", "जून", "जुला", "अग", "सित", "अक्टू", "नव", "दिस"];
const EN_MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Ymd {
  year: number;
  month: number; // 0-11
  day: number;
  weekday: number; // 0 = Sunday
}

/** Calendar parts of an IST date ("YYYY-MM-DD") or of an instant seen in India. */
function parts(value: Date | string): Ymd {
  const ymd = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toISTDate(value);
  const [y, m, d] = ymd.split("-").map(Number);
  return { year: y, month: m - 1, day: d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "सोमवार, 5 अक्टूबर" / "Mon, 5 Oct" */
export function dateBi(value: Date | string): Bi {
  const p = parts(value);
  return {
    hi: `${HI_WEEKDAY[p.weekday]}, ${p.day} ${HI_MONTH[p.month]}`,
    en: `${EN_WEEKDAY_SHORT[p.weekday]}, ${p.day} ${EN_MONTH_SHORT[p.month]}`,
  };
}

/** "गुरु" / "Thu" */
export function weekdayBi(value: Date | string): Bi {
  const p = parts(value);
  return { hi: HI_WEEKDAY_SHORT[p.weekday], en: EN_WEEKDAY_SHORT[p.weekday] };
}

/** "29 सित – 5 अक्टू" / "29 Sep – 5 Oct" for two IST dates. */
export function rangeBi(start: string, end: string): Bi {
  const a = parts(start);
  const b = parts(end);
  return {
    hi: `${a.day} ${HI_MONTH_SHORT[a.month]} – ${b.day} ${HI_MONTH_SHORT[b.month]}`,
    en: `${a.day} ${EN_MONTH_SHORT[a.month]} – ${b.day} ${EN_MONTH_SHORT[b.month]}`,
  };
}

/** 12-hour clock in India: "11:24 AM". */
export function clock12(value: Date | string): string {
  const mins = istMinutesOfDay(value);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "5 अक्टूबर, 11:24 AM" / "5 Oct, 11:24 AM IST" */
export function dateTimeBi(value: Date | string): Bi {
  const p = parts(value);
  const t = clock12(value);
  return { hi: `${p.day} ${HI_MONTH[p.month]}, ${t}`, en: `${p.day} ${EN_MONTH_SHORT[p.month]}, ${t} IST` };
}

function periodHi(minutes: number): string {
  const h = Math.floor(minutes / 60);
  if (h >= 4 && h < 12) return "सुबह";
  if (h >= 12 && h < 16) return "दोपहर";
  if (h >= 16 && h < 20) return "शाम";
  return "रात";
}

/** "सुबह 8 बजे" / "8 AM" for minutes since IST midnight. */
export function clockBi(minutes: number): Bi {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hh = h % 12 || 12;
  const mm = m ? `:${String(m).padStart(2, "0")}` : "";
  return { hi: `${periodHi(minutes)} ${hh}${mm} बजे`, en: `${hh}${mm} ${h < 12 ? "AM" : "PM"}` };
}

/** "आज, दोपहर 2 बजे" / "Today, 2 PM" for an instant. */
export function todayAtBi(value: Date | string): Bi {
  const c = clockBi(istMinutesOfDay(value));
  return { hi: `आज, ${c.hi}`, en: `Today, ${c.en}` };
}

const MEALS: Record<string, Bi> = {
  breakfast: { hi: "नाश्ता", en: "Breakfast" },
  "mid-morning": { hi: "सुबह का नाश्ता", en: "Mid-morning" },
  lunch: { hi: "दोपहर का खाना", en: "Lunch" },
  "evening snack": { hi: "शाम का नाश्ता", en: "Snack" },
  snack: { hi: "शाम का नाश्ता", en: "Snack" },
  dinner: { hi: "रात का खाना", en: "Dinner" },
};

/** Hindi + English name of a logged meal type; unknown types keep their own name in both. */
export function mealBi(type: string): Bi {
  return MEALS[type.trim().toLowerCase()] ?? { hi: type, en: type };
}

export type CaregiverRoleKey = "editor" | "viewer";

export const ROLE: Record<CaregiverRoleKey, { name: Bi; can: Bi; short: Bi }> = {
  editor: {
    name: { hi: "एडिटर", en: "Editor" },
    can: { hi: "आप रीडिंग, दवाएँ और भोजन जोड़ और बदल सकते हैं।", en: "You can add and edit readings, medicines and meals." },
    short: { hi: "रीडिंग जोड़ और बदल सकते हैं", en: "Can add and edit readings" },
  },
  viewer: {
    name: { hi: "व्यूअर", en: "Viewer" },
    can: { hi: "आप सारी जानकारी देख सकते हैं, पर कुछ जोड़ या बदल नहीं सकते।", en: "You can see everything, but can't add or change anything." },
    short: { hi: "सिर्फ़ देख सकते हैं", en: "Can only view" },
  },
};

/** Indian digit grouping, e.g. 1640 -> "1,640". */
export const num = (n: number): string => n.toLocaleString("en-IN");
