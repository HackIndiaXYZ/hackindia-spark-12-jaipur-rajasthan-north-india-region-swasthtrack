/**
 * Text normalisation + whole-token keyword lexicons (Hindi / Hinglish / English).
 *
 * PURE. Design rule (the old normaliser got this wrong): we NEVER rewrite the
 * user's words. We fold them to a comparable form and match WHOLE TOKENS or
 * whole phrases. Fuzzy matching exists only to suggest "did you mean ...".
 */

import type { Metric } from "./types";

const ZERO_WIDTH = /[​-‍⁠﻿]/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Map Devanagari / Arabic-Indic digits to ASCII so "१२०" === "120". */
export function normalizeDigits(text: string): string {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0966 && c <= 0x096f) out += String(c - 0x0966);
    else if (c >= 0x0660 && c <= 0x0669) out += String(c - 0x0660);
    else out += ch;
  }
  return out;
}

/** Strip control characters and zero-width marks; collapse whitespace; NFC. */
export function sanitizeText(text: string): string {
  return text
    .normalize("NFC")
    // Removed, not spaced: "ig\u0000nore" must become "ignore" so injection detection still sees it.
    .replace(CONTROL, "")
    .replace(ZERO_WIDTH, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Devanagari spelling folds: drop nukta, chandrabindu -> anusvara. */
function foldDevanagari(text: string): string {
  return text.normalize("NFD").replace(/़/g, "").replace(/ँ/g, "ं").normalize("NFC");
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

/**
 * Lower-case, fold, and replace punctuation with spaces. `. : / -` survive only
 * between digits so "10/10", "08:15", "2026-10-04" and "132.5" stay intact.
 */
export function fold(text: string): string {
  const s = normalizeDigits(foldDevanagari(sanitizeText(text))).toLowerCase();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const isLetterOrDigit = /[a-z0-9ऀ-ॿ]/.test(ch);
    if (isLetterOrDigit) {
      out += ch;
    } else if ((ch === "." || ch === ":" || ch === "/" || ch === "-" || ch === ",") && isDigit(s[i - 1]) && isDigit(s[i + 1])) {
      out += ch;
    } else if (ch === "'" || ch === "’") {
      // keep contractions ("can't") as one token without the apostrophe
      continue;
    } else {
      out += " ";
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

export function tokenize(text: string): string[] {
  const f = fold(text);
  return f ? f.split(" ") : [];
}

/** True when `phrase` (already folded) occurs in `folded` on token boundaries. */
export function hasPhrase(folded: string, phrase: string): boolean {
  return ` ${folded} `.includes(` ${phrase} `);
}

// ---------------------------------------------------------------------------
// Lexicons. Written in natural spelling and folded at load, so adding a variant
// is one string. Multi-word entries are matched as phrases.
// ---------------------------------------------------------------------------

export function lex(entries: string[]): string[] {
  return Array.from(new Set(entries.map((e) => fold(e)).filter(Boolean)));
}

const METRIC_WORDS: Record<Metric, string[]> = {
  bp: [
    "bp", "b p", "blood pressure", "bloodpressure", "pressure", "systolic", "diastolic", "hypertension",
    "बीपी", "बी पी", "ब्लड प्रेशर", "ब्लडप्रेशर", "प्रेशर", "रक्तचाप", "ब्लड प्रेसर", "बीपी", "upper", "lower reading", "reading", "readings", "रीडिंग",
  ],
  pulse: ["pulse", "heart rate", "heartrate", "nabz", "nabj", "dhadkan", "नब्ज़", "नब्ज", "धड़कन", "पल्स"],
  weight: [
    "weight", "wajan", "vajan", "wajn", "kg", "kilo", "bmi", "mota", "motapa", "motapa", "patla",
    "वज़न", "वजन", "वेट", "मोटापा", "किलो", "बीएमआई",
  ],
  food: [
    "food", "khana", "khaana", "khaya", "khayi", "khaye", "khane", "meal", "meals", "breakfast", "nashta", "nasta", "naashta",
    "lunch", "dinner", "snack", "snacks", "calorie", "calories", "kcal", "protein", "carbs", "carbohydrate", "fat", "fibre", "fiber",
    "namak", "salt", "sodium", "oil", "ghee", "tel", "diet", "roti", "chawal", "dal", "sabzi", "chai", "doodh",
    "खाना", "खाया", "खाई", "खाये", "खाए", "खाने", "भोजन", "नाश्ता", "नाश्ते", "कैलोरी", "कैलोरीज", "प्रोटीन", "नमक", "सोडियम",
    "तेल", "घी", "डाइट", "रोटी", "चावल", "दाल", "सब्ज़ी", "सब्जी", "चाय", "दूध", "डिनर", "लंच",
    "kela", "banana", "seb", "apple", "santra", "orange", "angoor", "papita", "aam", "mango", "anda", "ande", "egg", "eggs", "paneer", "dahi", "curd", "lassi", "chhaas", "chaas",
    "rice", "paratha", "puri", "samosa", "pakora", "pakoda", "biryani", "khichdi", "poha", "upma", "idli", "dosa", "achar", "pickle", "papad", "namkeen", "mithai", "chini", "cheeni",
    "gud", "jaggery", "fruit", "fruits", "phal", "sabji", "nashte", "mutton", "chicken", "machhli", "fish", "bread", "biscuit", "biscuits", "juice", "coffee",
    // English eating verbs ("what did he eat yesterday"). Not "khata/khate": "dawai khate hain" is about medicines.
    "eat", "ate", "eaten", "eating", "drink", "drank", "drinking", "piya", "पिया",
    "केला", "सेब", "संतरा", "अंगूर", "पपीता", "आम", "अंडा", "अंडे", "पनीर", "दही", "लस्सी", "छाछ", "पराठा", "पूरी", "समोसा", "पकोड़ा", "बिरयानी", "खिचड़ी", "पोहा", "इडली", "डोसा",
    "अचार", "पापड़", "नमकीन", "मिठाई", "चीनी", "गुड़", "फल", "चिकन", "मछली", "बिस्किट", "जूस", "कॉफ़ी", "कॉफी",
  ],
  // NOTE: never the bare word "so" (English "so what ..." is not about sleep); only whole Hinglish phrases.
  sleep: [
    "sleep", "slept", "sleeping", "neend", "nind", "sona", "soya", "soye", "sone", "sota", "sote", "soti",
    "so raha", "so rahe", "so rahi", "so gaya", "so gaye", "so gayi", "so jata", "so jate", "so jati", "so rhe", "so rha",
    "नींद", "सोया", "सोये", "सोए", "सोना", "सोता", "सोते", "सोती", "सो रहा", "सो रहे", "सो रही", "सो गया", "सो गए", "स्लीप",
  ],
  steps: [
    "steps", "step", "kadam", "kadme", "walk", "walked", "walking", "chala", "chale", "chali", "tehal", "tahal", "tehla", "tahla",
    "exercise", "activity", "distance",
    "कदम", "स्टेप्स", "स्टेप", "चला", "चले", "चली", "टहल", "टहला", "टहले", "वॉक", "सैर", "एक्सरसाइज",
  ],
  medicine: [
    "medicine", "medicines", "medication", "medications", "dawai", "dawa", "dawaai", "davai", "davaai", "dawaiyan", "dawaiyaan",
    "tablet", "tablets", "goli", "goliyan", "dose", "adherence", "pill", "pills", "capsule", "capsules", "syrup", "injection", "insulin", "inhaler",
    "दवा", "दवाई", "दवाइयाँ", "दवाइयां", "दवाईयां", "दवाएं", "दवाएँ", "दवाइयों", "गोली", "गोलियां", "गोलियाँ", "टैबलेट", "मेडिसिन", "डोज़", "डोज",
  ],
};

export const METRIC_LEXICON: Record<Metric, string[]> = Object.fromEntries(
  (Object.keys(METRIC_WORDS) as Metric[]).map((m) => [m, lex(METRIC_WORDS[m])]),
) as Record<Metric, string[]>;

export type Intent =
  | "summary"
  | "average"
  | "trend"
  | "compare"
  | "adherence"
  | "latest"
  | "goal_gap"
  | "missing"
  | "value"
  | "extreme"
  | "advice";

const INTENT_WORDS: Record<Intent, string[]> = {
  // Strong: these only ever ask for a day/period review. The ambiguous "kaisa hai / how is" are SUMMARY_WEAK.
  summary: [
    "kaise rahe", "kaisa raha", "kaisi rahi", "kese rahe", "kaisey rahe", "how did", "summary", "overview", "saransh", "report", "update", "status",
    "din kaisa", "kya hua",
    "कैसे रहे", "कैसा रहा", "कैसी रही", "सारांश", "रिपोर्ट", "अपडेट", "क्या हुआ",
  ],
  average: ["average", "avg", "mean", "aushat", "ausat", "on average", "औसत", "एवरेज"],
  trend: [
    "trend", "trending", "badh", "badha", "badhta", "badhti", "badhna", "ghat", "ghata", "ghatta", "ghatti", "increase", "increased",
    "decrease", "decreased", "improved", "improving", "better", "worse", "sudhar", "sudhra", "bigad", "bigda", "going up",
    "going down", "rising", "falling",
    "बढ़", "बढ", "बढ़ा", "बढा", "बढ़ रहा", "घट", "घटा", "घट रहा", "सुधार", "सुधरा", "बिगड़", "बिगड़ा", "ट्रेंड",
  ],
  compare: [
    "compare", "comparison", "compared", "versus", "vs", "tulna", "difference", "antar", "farak", "fark", "change", "changed",
    "badlav", "badla", "badal", "se kya change", "kya badla", "what changed",
    "तुलना", "फर्क", "फ़र्क", "अंतर", "बदलाव", "बदला", "बदल", "क्या बदला",
  ],
  adherence: [
    "adherence", "taken", "missed", "miss", "missing dose", "chhoot", "chhut", "chhooti", "li ya nahi", "le li", "li thi", "nahi li",
    "on time", "late", "छूट", "छूटी", "ली या नहीं", "ले ली", "ली थी", "नहीं ली", "समय पर",
  ],
  latest: [
    "latest", "last reading", "last time", "last bp", "last weight", "last recorded", "recent", "recently", "abhi", "aakhri", "akhri", "taaza", "taza", "current", "currently", "now", "filhaal", "filhal",
    "अभी", "आखिरी", "आख़िरी", "ताज़ा", "ताजा", "फिलहाल", "हाल का", "आखरी",
  ],
  goal_gap: [
    "target", "goal", "lakshya", "kitna door", "kitna bacha", "kitna baaki", "remaining", "gap", "away from", "to go", "kitni door",
    "hona chahiye", "honi chahiye", "hone chahiye", "normal range", "normal kitna", "kitna normal", "control mein", "control me", "under control", "target ke andar", "within target", "range mein", "range me",
    "लक्ष्य", "टारगेट", "कितना दूर", "कितना बचा", "कितना बाकी", "कितनी दूर", "होना चाहिए", "होनी चाहिए", "कंट्रोल में", "रेंज में",
  ],
  missing: [
    "missing", "nahi bhara", "nahi bhare", "kya kya miss", "kuch miss", "miss hua", "kya miss", "kya kuch chhoot", "kuch chhoot", "log nahi", "not logged", "not recorded", "kya raha",
    "entry nahi", "nahi kiya", "not filled", "bhara nahi", "kitne din nahi",
    "रह गया", "रह गई", "नहीं भरा", "नहीं भरे", "दर्ज नहीं", "क्या क्या मिस", "कुछ मिस", "मिस हुआ", "मिसिंग",
  ],
  advice: [
    "kaise kam", "kaise ghataye", "kaise ghatayein", "kaise control", "kya karein", "kya karna chahiye", "kya khana chahiye", "kya na khayein", "kya nahi khana", "kya khayein",
    "tips", "tip", "upay", "ilaaj", "solution", "how to", "how can", "what should", "should i", "suggest", "suggestion", "advice", "salah", "sujhav", "avoid", "parhej", "diet plan",
    "kam karne", "reduce", "kaise rakhe", "kaise rakhein", "kaise badhaye", "kaise badhayein", "kaise sudhare", "kaise sudharein", "kaise bachein", "kaise bache", "kya karu", "kya karun", "kya karen", "kya kare", "kya karo", "healthy kaise",
    "कैसे कम", "कैसे घटाएं", "कैसे कंट्रोल", "क्या करें", "क्या करना चाहिए", "क्या खाना चाहिए", "क्या न खाएं", "सुझाव", "सलाह", "उपाय", "इलाज", "परहेज़", "कम करने", "कैसे रखें", "कैसे बढ़ाएं", "कैसे सुधारें", "कैसे बचें", "क्या करूं", "क्या करूँ", "क्या करें", "क्या करे",
  ],
  // "sabse zyada BP kab tha": the highest / lowest / best / worst entry and WHEN it was.
  extreme: [
    "sabse zyada", "sabse jyada", "sabse jada", "sabse high", "sabse upar", "sabse kam", "sabse low", "sabse neeche", "sabse bada", "sabse chhota", "sabse achha", "sabse accha", "sabse bura",
    "highest", "lowest", "maximum", "minimum", "peak", "worst", "best day", "most ever",
    "सबसे ज़्यादा", "सबसे ज्यादा", "सबसे कम", "सबसे ऊँचा", "सबसे ऊंचा", "सबसे ऊँची", "सबसे ऊंची", "सबसे बड़ा", "सबसे छोटा", "सबसे अच्छा", "सबसे बुरा",
  ],
  value: [
    "kya tha", "kya thi", "kya the", "kitna tha", "kitni thi", "kitne the", "what was", "what were", "how much", "how many",
    "kitna", "kitni", "kitne", "kya khaya", "kya liya",
    "क्या था", "क्या थी", "क्या थे", "कितना था", "कितनी थी", "कितने थे", "कितना", "कितनी", "कितने", "क्या खाया", "क्या लिया",
  ],
};

export const INTENT_LEXICON: Record<Intent, string[]> = Object.fromEntries(
  (Object.keys(INTENT_WORDS) as Intent[]).map((k) => [k, lex(INTENT_WORDS[k])]),
) as Record<Intent, string[]>;

/**
 * "How is it?" phrasings. They only mean "review the patient" when the question names the
 * patient or his health; on their own ("aaj mausam kaisa hai") they are not a health question.
 */
const SUMMARY_WEAK = lex([
  "kaise hain", "kaisa hai", "kaise hai", "kaisi hai", "kaise ho", "how was", "how is", "how are", "how has", "haal", "kya haal",
  "theek hain", "theek hai", "thik hain", "thik hai", "theek the", "theek raha", "theek rahe", "is he fine", "is he ok", "is he okay", "is he well", "is she fine", "is she ok", "is she okay",
  "कैसे हैं", "कैसा है", "कैसी है", "हाल", "क्या हाल", "ठीक हैं", "ठीक है", "ठीक रहे", "ठीक रहा",
]);

/** Words that name the patient (or his health) as the subject of the question. */
export const SUBJECT_LEXICON = lex([
  "papa", "pappa", "pitaji", "pita", "baba", "dad", "father", "mummy", "mama", "maa", "mom", "mother", "mataji", "dadi", "nani", "dada", "nana", "patient",
  "unka", "unki", "unke", "inka", "inki", "inke", "he", "she", "him", "her", "his", "sehat", "sehet", "tabiyat", "tabiat", "health", "swasthya",
  "पापा", "पिताजी", "पिता", "बाबा", "मम्मी", "मां", "माँ", "माताजी", "दादी", "नानी", "दादा", "नाना", "मरीज़", "मरीज", "उनका", "उनकी", "उनके", "इनका", "इनकी", "इनके", "सेहत", "तबीयत", "स्वास्थ्य",
]);

/** Plain health vocabulary that is a health question even without a tracked metric ("dard", "doctor"). */
export const HEALTH_LEXICON = lex([
  "bimari", "bimaari", "dard", "pain", "doctor", "dr", "hospital", "ilaaj", "symptom", "symptoms", "lakshan", "tabiyat", "chakkar", "kamzori", "weakness", "allergy", "allergic", "nuksan", "fayda", "safe",
  "बीमारी", "दर्द", "डॉक्टर", "अस्पताल", "इलाज", "लक्षण", "चक्कर", "कमज़ोरी", "कमजोरी", "एलर्जी", "नुकसान", "फ़ायदा", "फायदा",
]);

/** Tokens that carry no meaning for intent detection (never rewritten, just ignored). */
const STOP = lex([
  "papa", "pappa", "pitaji", "mummy", "mama", "maa", "patient", "ji", "ka", "ke", "ki", "ko", "me", "mein", "main", "se", "ne", "hai", "hain",
  "tha", "thi", "the", "raha", "rahi", "rahe", "kya", "aur", "or", "and", "the", "a", "an", "of", "in", "on", "for", "to", "is", "was",
  "पापा", "का", "के", "की", "को", "में", "से", "ने", "है", "हैं", "था", "थी", "थे", "रहा", "रही", "रहे", "क्या", "और",
]);

export function matchesAny(folded: string, list: string[]): boolean {
  for (const w of list) {
    if (hasPhrase(folded, w)) return true;
  }
  return false;
}

export function detectMetrics(text: string): Metric[] {
  const f = fold(text);
  const found: Metric[] = [];
  (Object.keys(METRIC_LEXICON) as Metric[]).forEach((m) => {
    if (matchesAny(f, METRIC_LEXICON[m])) found.push(m);
  });
  return found;
}

export function detectIntents(text: string): Intent[] {
  const f = fold(text);
  const found: Intent[] = [];
  (Object.keys(INTENT_LEXICON) as Intent[]).forEach((i) => {
    if (matchesAny(f, INTENT_LEXICON[i])) found.push(i);
  });
  if (!found.includes("summary") && matchesAny(f, SUMMARY_WEAK) && (matchesAny(f, SUBJECT_LEXICON) || matchesAny(f, HEALTH_LEXICON))) found.push("summary");
  return found;
}

/** True when the question names the patient or uses plain health vocabulary. */
export function hasHealthAnchor(text: string): boolean {
  const f = fold(text);
  return matchesAny(f, SUBJECT_LEXICON) || matchesAny(f, HEALTH_LEXICON);
}

export function containsAnyPhrase(text: string, phrases: string[]): boolean {
  return matchesAny(fold(text), lex(phrases));
}

// ---------------------------------------------------------------------------
// "Did you mean ...": suggestion only. Never alters the query.
// ---------------------------------------------------------------------------

export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const SUGGESTION_VOCAB: string[] = Array.from(
  new Set(
    [...Object.values(METRIC_LEXICON).flat(), ...Object.values(INTENT_LEXICON).flat()].filter(
      (w) => /^[a-z]+$/.test(w) && w.length >= 4,
    ),
  ),
);

const KNOWN_TOKENS = new Set<string>([...SUGGESTION_VOCAB, ...STOP]);

export interface Suggestion {
  token: string;
  suggestion: string;
}

/** Latin tokens that look like a typo of a known keyword. Suggestion only. */
export function suggestCorrections(text: string): Suggestion[] {
  const out: Suggestion[] = [];
  for (const t of tokenize(text)) {
    if (!/^[a-z]{4,}$/.test(t) || KNOWN_TOKENS.has(t)) continue;
    const limit = t.length <= 5 ? 1 : 2;
    let best: { w: string; d: number } | null = null;
    for (const w of SUGGESTION_VOCAB) {
      const d = levenshtein(t, w, limit);
      if (d <= limit && (!best || d < best.d)) best = { w, d };
    }
    if (best) out.push({ token: t, suggestion: best.w });
  }
  return out;
}
