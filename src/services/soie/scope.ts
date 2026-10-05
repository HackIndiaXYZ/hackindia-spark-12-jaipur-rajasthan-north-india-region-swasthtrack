/**
 * What is the question actually ABOUT? PURE.
 *
 * The rules engine used to answer every question that contained a date or a
 * "how is it" word with a summary of the patient, so "aaj mausam kaisa hai"
 * returned BP numbers. These detectors decide, before any data is shown,
 * whether the question is
 *   - small talk (greeting / thanks),
 *   - about something the app does not track (blood sugar, cholesterol, labs ...),
 *   - not about health at all (weather, news ...),
 *   - an advice / "what should we do" question (word ORDER does not matter:
 *     "BP kam kaise karein" and "kaise karein BP kam" are the same question),
 *   - about WHEN a medicine is taken (schedule) rather than whether it was taken,
 *   - naming one of the patient's own medicines.
 *
 * Whole-token / whole-phrase matching only (see normalize.ts). Nothing here
 * rewrites the user's words.
 */

import { fold, hasPhrase, lex, levenshtein, matchesAny, tokenize } from "./normalize";
import type { MedicineInfo } from "./types";

const has = (folded: string, list: string[]) => matchesAny(folded, list);

// ---------------------------------------------------------------------------
// Small talk
// ---------------------------------------------------------------------------

const GREETING = lex([
  "hi", "hii", "hey", "hello", "helo", "namaste", "namaskar", "pranam", "salam", "good morning", "good afternoon", "good evening", "good night",
  "नमस्ते", "नमस्कार", "हेलो", "हैलो", "हाय", "प्रणाम", "सुप्रभात",
]);
const THANKS = lex([
  "thanks", "thank you", "thankyou", "thx", "shukriya", "shukria", "dhanyavad", "dhanyawad", "ok", "okay", "accha", "achha", "theek hai", "thik hai", "got it", "samajh gaya", "bahut accha",
  "धन्यवाद", "शुक्रिया", "ओके", "अच्छा", "ठीक है", "समझ गया",
]);
/** Words that may sit next to a greeting / thanks without making it a question. */
const FILLER = new Set(
  lex([
    "kaise", "ho", "hain", "hai", "aap", "ji", "sir", "madam", "soie", "bhai", "kya", "haal", "chaal", "sab", "theek", "thik", "how", "are", "you", "there", "hoon", "hu", "bahut", "aapka", "aapko", "so", "much", "a", "lot", "aur", "bol", "bolo", "all", "good",
    "कैसे", "हो", "हैं", "है", "आप", "जी", "क्या", "हाल", "चाल", "सब", "ठीक", "बहुत", "आपका", "आपको",
  ]),
);

function stripPhrases(folded: string, phrases: string[]): { rest: string[]; hit: boolean } {
  let s = ` ${folded} `;
  let hit = false;
  for (const p of [...phrases].sort((a, b) => b.length - a.length)) {
    const needle = ` ${p} `;
    while (s.includes(needle)) {
      s = s.replace(needle, " ");
      hit = true;
    }
  }
  return { rest: s.split(" ").filter(Boolean), hit };
}

export function detectSmallTalk(text: string): "greeting" | "thanks" | null {
  const f = fold(text);
  if (!f) return null;
  const g = stripPhrases(f, GREETING);
  if (g.hit && g.rest.every((t) => FILLER.has(t))) return "greeting";
  const t = stripPhrases(f, THANKS);
  if (t.hit && t.rest.every((x) => FILLER.has(x))) return "thanks";
  return null;
}

// ---------------------------------------------------------------------------
// Things the app does not track
// ---------------------------------------------------------------------------

export interface UntrackedTopic {
  key: string;
  hi: string;
  en: string;
}

const UNTRACKED: Array<UntrackedTopic & { words: string[] }> = [
  {
    key: "blood_sugar",
    hi: "ब्लड शुगर",
    en: "blood sugar",
    words: lex(["sugar", "shugar", "glucose", "hba1c", "a1c", "blood sugar", "sugar level", "शुगर", "ग्लूकोज", "ग्लूकोज़", "ग्लूकोस"]),
  },
  {
    key: "cholesterol",
    hi: "कोलेस्ट्रॉल",
    en: "cholesterol",
    words: lex(["cholesterol", "cholestrol", "lipid", "lipids", "ldl", "hdl", "triglyceride", "triglycerides", "कोलेस्ट्रॉल", "कोलेस्ट्रोल", "लिपिड"]),
  },
  {
    key: "oxygen",
    hi: "ऑक्सीजन लेवल",
    en: "oxygen level",
    words: lex(["oxygen", "spo2", "saturation", "oximeter", "ऑक्सीजन", "ऑक्सिजन", "ऑक्सीमीटर"]),
  },
  {
    key: "temperature",
    hi: "बुखार / तापमान",
    en: "temperature / fever",
    words: lex(["temperature", "fever", "bukhar", "bukhaar", "tapman", "thermometer", "बुखार", "तापमान", "टेम्परेचर"]),
  },
  {
    key: "lab_tests",
    hi: "लैब जाँच / रिपोर्ट",
    en: "lab tests / scans",
    words: lex([
      "thyroid", "creatinine", "kidney", "liver", "lft", "kft", "urine", "hemoglobin", "haemoglobin", "cbc", "lab report", "blood report", "test report", "blood test", "lab test", "x-ray", "xray", "mri", "ct scan", "ecg", "ekg", "echo",
      "थायरॉइड", "किडनी", "लीवर", "यूरिन", "ब्लड टेस्ट", "लैब रिपोर्ट", "एक्स-रे", "ईसीजी",
    ]),
  },
  {
    key: "appointments",
    hi: "डॉक्टर की अपॉइंटमेंट / संपर्क",
    en: "doctor appointments / contacts",
    words: lex(["appointment", "opd", "doctor number", "doctor ka number", "hospital ka number", "अपॉइंटमेंट", "डॉक्टर का नंबर", "अस्पताल का नंबर"]),
  },
];

export function detectUntracked(text: string): UntrackedTopic[] {
  const f = fold(text);
  return UNTRACKED.filter((u) => has(f, u.words)).map(({ key, hi, en }) => ({ key, hi, en }));
}

// ---------------------------------------------------------------------------
// Not about health at all
// ---------------------------------------------------------------------------

const OFF_TOPIC = lex([
  "mausam", "weather", "barish", "baarish", "temperature outside", "news", "khabar", "khabrein", "cricket", "match", "score", "ipl", "movie", "film", "song", "gaana", "gana", "joke", "chutkula", "politics", "election", "modi",
  "prime minister", "president", "stock", "share market", "sensex", "nifty", "bitcoin", "petrol", "diesel", "train", "flight", "ticket", "bank", "loan", "capital of", "population", "horoscope", "rashifal", "lottery",
  "मौसम", "बारिश", "खबर", "ख़बर", "क्रिकेट", "मैच", "स्कोर", "फिल्म", "गाना", "चुटकुला", "चुनाव", "प्रधानमंत्री", "शेयर", "पेट्रोल", "राशिफल",
]);

export function detectOffTopic(text: string): boolean {
  return has(fold(text), OFF_TOPIC);
}

// ---------------------------------------------------------------------------
// Advice / "what should we do"
// ---------------------------------------------------------------------------

const HOW = lex(["kaise", "kaisey", "kese", "kaisay", "how", "कैसे"]);
const ACTION = lex([
  // Only forms that mean "do / change something". NOT "theek", "normal", "kar" (as in "kaise kar rahe hain" = how is he doing).
  "kam", "kum", "ghata", "ghataye", "ghatayein", "ghatana", "ghatao", "badha", "badhaye", "badhayein", "badhana", "badhao", "control", "karu", "karun", "karein", "karen", "kare", "karna", "rakhe", "rakhein", "rakhna",
  "sudhar", "sudhare", "sudharein", "sudharna", "bache", "bachein", "bachna", "bachao", "lower", "reduce", "improve", "increase", "manage", "prevent", "avoid", "fix", "banaye", "banayein", "banana",
  "कम", "घटा", "घटाएं", "घटाना", "बढ़ा", "बढ़ाएं", "बढ़ाना", "कंट्रोल", "करूं", "करूँ", "करें", "करे", "करना", "रखें", "रखना", "सुधार", "सुधारें", "बचें", "बचना", "बनाएं", "बनाना",
]);
const PERMISSION = lex(["sakta", "sakte", "sakti", "सकता", "सकते", "सकती", "allowed", "permitted", "ijazat", "इजाज़त"]);
const NEED = lex(["chahiye", "chahie", "chaahiye", "चाहिए", "चाहिये"]);
const SHOULD_PHRASES = lex([
  "can he", "can she", "can papa", "can i", "can we", "can they", "should he", "should she", "should papa", "should i", "should we", "may he", "may i", "what to eat", "what to avoid", "what to do", "what should",
  "is it safe", "is it ok", "is it okay", "is it good", "is it bad", "good for", "bad for", "safe for", "kya karein", "kya karen", "kya karu", "kya karun", "kya kare", "क्या करें", "क्या करूं", "क्या करूँ", "kya karna", "kya khayein", "kya nahi khana", "kya na khayein", "kya pina", "kya peena",
  "fayda", "nuksan", "फ़ायदा", "फायदा", "नुकसान", "क्या करना", "क्या पीना",
]);
/** "BP kitna hona chahiye" asks for the reference value, not for advice. */
const REFERENCE_VALUE = lex(["hona chahiye", "honi chahiye", "hone chahiye", "होना चाहिए", "होनी चाहिए", "होने चाहिए"]);
/** "kya aap bata sakte hain ki BP kitna tha" is a polite data request, not a permission question. */
const POLITE_REQUEST = new Set(lex(["bata", "bataiye", "batayen", "batayiye", "batao", "btao", "dikha", "dikhao", "dikhaiye", "bol", "bolo", "boliye", "tell", "show", "give", "check", "बता", "बताइए", "बताएं", "बताओ", "दिखा", "दिखाओ", "दिखाइए", "बोल", "बोलो"]));

export function detectAdviceQuestion(text: string): boolean {
  const f = fold(text);
  if (!f) return false;
  if (has(f, REFERENCE_VALUE)) return false;
  if (has(f, SHOULD_PHRASES)) return true;
  if (has(f, HOW) && has(f, ACTION)) return true;
  // "kela kha sakte hain?" / "walk kar sakte hain kya": permission questions are advice, not data lookups.
  if (has(f, PERMISSION) && !tokenize(text).some((t) => POLITE_REQUEST.has(t))) return true;
  if (has(f, NEED)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Medicine schedule ("kab leni hai", "kaun si dawai") vs adherence ("li ya nahi")
// ---------------------------------------------------------------------------

const SCHEDULE = lex([
  "kab leni", "kab lena", "kab leta", "kab lete", "kab khani", "kab khana", "kab kab", "kitne baje leni", "kitne baje lena", "kitne baje khani", "kis time", "kis samay", "what time", "schedule", "timing", "timings",
  "dawai ki list", "dawai list", "medicine list", "list of medicines", "medicines list", "kaun si dawai", "kaunsi dawai", "kon si dawai", "konsi dawai", "kaun kaun si", "kaun kon si", "which medicine", "which medicines", "what medicine", "what medicines",
  "kya kya dawai", "kitni dawai", "kitni dawaiyan", "dawai ke naam", "dawaiyon ke naam", "medicines ke naam", "dose kya hai", "dose kitni", "kitni dose", "kitne mg", "khurak kitni",
  "कब लेनी", "कब लेना", "कब खानी", "कब खाना", "कितने बजे", "किस समय", "कौन सी दवा", "कौनसी दवा", "कौन सी दवाई", "कौनसी दवाई", "दवा की लिस्ट", "दवाई की लिस्ट", "क्या क्या दवा", "कितनी दवा", "दवा के नाम", "दवाइयों के नाम", "खुराक कितनी",
]);
/** If any of these is present the question is about whether a dose was taken / is due today, not about the plan. */
const DOSE_STATUS = new Set(
  lex([
    "li", "liya", "lee", "thi", "tha", "gayi", "gaya", "chhoot", "chhooti", "chhut", "missed", "miss", "took", "taken", "had", "baaki", "pending", "bachi", "bacha", "abhi tak", "nahi li", "le li",
    "ली", "लिया", "थी", "था", "गई", "गया", "छूट", "छूटी", "बाकी", "बची", "बचा",
  ]),
);

export function detectScheduleQuestion(text: string): boolean {
  const f = fold(text);
  if (!has(f, SCHEDULE)) return false;
  const toks = tokenize(text);
  // "kal kitne baje dawai li" asks when it WAS taken; "aaj ki dawai kaunsi baaki hai" asks what is still due.
  return !toks.some((t) => DOSE_STATUS.has(t));
}

// ---------------------------------------------------------------------------
// Medicines named in the question
// ---------------------------------------------------------------------------

/** Brand/generic names the patient's own medicine list uses; matched on whole tokens with a small typo allowance. */
export function matchMedicines(text: string, medicines: MedicineInfo[]): MedicineInfo[] {
  const toks = tokenize(text).filter((t) => /^[a-z]{4,}$/.test(t));
  const f = fold(text);
  const out: MedicineInfo[] = [];
  for (const m of medicines) {
    const name = fold(m.name);
    if (!name) continue;
    const parts = name.split(" ").filter((p) => /^[a-z]{4,}$/.test(p));
    let hit = hasPhrase(f, name);
    if (!hit) {
      for (const p of parts) {
        const limit = p.length <= 6 ? 1 : 2;
        if (toks.some((t) => t === p || (t.length >= 5 && levenshtein(t, p, limit) <= limit))) {
          hit = true;
          break;
        }
      }
    }
    if (hit) out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Symptoms, saved notes, "when do I take it"
// ---------------------------------------------------------------------------

const SYMPTOM = lex([
  "dard", "pain", "chakkar", "chakkar aa", "kamzori", "weakness", "ulti", "vomit", "vomiting", "ghabrahat", "dizzy", "dizziness", "headache", "sirdard", "sir dard", "sujan", "swelling", "khansi", "cough", "bukhar hai", "pet dard", "nausea", "jalan",
  "दर्द", "चक्कर", "कमज़ोरी", "कमजोरी", "उल्टी", "घबराहट", "सिरदर्द", "सूजन", "खांसी", "खाँसी", "बुखार है", "जलन",
]);

/** The family describes a symptom. The app cannot assess it; it must say so and point to the doctor. */
export function detectSymptomMention(text: string): boolean {
  return has(fold(text), SYMPTOM);
}

const MEMORY_LOOKUP = lex([
  "allergy", "allergic", "alergy", "allergies", "एलर्जी", "yaad hai", "yaad rakha", "kya yaad", "saved notes", "what do you remember", "kya save", "याद है", "याद रखा", "क्या याद", "क्या सेव",
]);

/** "doodh se allergy hai kya": only what the family saved can answer that. */
export function detectMemoryLookup(text: string): boolean {
  return has(fold(text), MEMORY_LOOKUP);
}

const TAKE_WHEN = lex(["kab leni", "kab lena", "kab leta", "kab lete", "kitne baje leni", "kitne baje lena", "कब लेनी", "कब लेना", "कितने बजे लेनी", "कितने बजे लेना"]);

/** "metformin kab leni hai": a take-it-when question even when the drug name is not one we know. */
export function detectTakeWhen(text: string): boolean {
  return has(fold(text), TAKE_WHEN);
}

/** Meaningful content tokens of a question (names, foods), for matching it against saved notes. */
export function contentTokens(text: string): string[] {
  const STOP = new Set(lex(["hai", "hain", "kya", "ko", "se", "ka", "ke", "ki", "me", "mein", "papa", "pappa", "unko", "unhe", "the", "is", "he", "she", "any", "does", "have", "ho", "tha", "thi", "to", "aur", "or", "for", "of", "yaad", "allergy", "allergic", "alergy", "एलर्जी", "है", "हैं", "क्या", "को", "से", "का", "के", "की", "में", "पापा", "याद"]));
  return tokenize(text).filter((t) => t.length >= 3 && !STOP.has(t));
}
