/**
 * Safety gate. PURE. Runs BEFORE any model sees the question.
 *
 *  1. Emergency symptoms (Hindi / Hinglish / English / Devanagari) -> a fixed,
 *     deterministic emergency answer. No LLM, no latency, no variance.
 *  2. A crisis-range reading (latest log within 24h, or typed by the user) must
 *     lead the answer whatever was asked.
 *  3. Requests to start/stop/change a medicine, or to be diagnosed, are flagged so
 *     the answer explains and refers to the doctor instead of instructing.
 *  4. Prompt-injection hygiene: control characters stripped, instruction-like
 *     text neutralised, angle brackets removed so user text cannot close our
 *     delimiters. The user's words are DATA, never instructions.
 *
 * Matching is token-window based on folded text (see normalize.ts), with simple
 * negation handling ("seene mein dard nahi hai" is not an emergency).
 */

import { classifyBP, isPlausibleBP, DEFAULT_BP_THRESHOLDS, type BPThresholds } from "@/lib/health-rules";
import { fold, normalizeDigits, sanitizeText } from "./normalize";
import { formatDateEn, formatDateHi } from "./temporal";
import type {
  AnswerDraft,
  BPRecord,
  CrisisReading,
  EmergencyReason,
  SafetyAssessment,
} from "./types";

// ---------------------------------------------------------------------------
// Emergency rules
// ---------------------------------------------------------------------------

interface EmergencyRule {
  reason: EmergencyReason;
  /** Token sequences (folded at load) that match on their own. */
  phrases?: string[];
  /** Every group must have a hit within `window` tokens of each other. */
  groups?: string[][];
  window?: number;
  /** When true, a negator right next to the match cancels it. */
  negatable?: boolean;
}

const RULES_SRC: EmergencyRule[] = [
  {
    reason: "chest_pain",
    negatable: true,
    phrases: [
      "heart attack", "cardiac arrest", "dil ka daura", "dil ka dora", "dil ka dawra", "हार्ट अटैक", "दिल का दौरा", "दिल का दौरा पड़ा",
      "chest pain", "chest tightness", "chest pressure", "chest discomfort", "pain in chest", "pain in the chest",
    ],
    groups: [
      ["chest", "seene", "seena", "seeney", "sine", "सीने", "सीना", "छाती", "chhati", "chhaati", "chaati"],
      ["pain", "dard", "दर्द", "tightness", "tight", "jakdan", "जकड़न", "pressure", "dabav", "दबाव", "bhaari", "bhari", "भारी", "भारीपन", "bharipan", "burning", "jalan", "जलन", "discomfort", "takleef", "तकलीफ"],
    ],
    window: 4,
  },
  {
    reason: "chest_pain",
    negatable: true,
    groups: [
      ["dil", "heart", "hriday", "दिल", "हृदय"],
      ["pain", "dard", "दर्द", "ghabrahat", "घबराहट", "jakdan", "जकड़न", "takleef", "तकलीफ", "tightness"],
    ],
    window: 3,
  },
  {
    reason: "breathless",
    negatable: true,
    phrases: [
      "breathless", "breathlessness", "short of breath", "shortness of breath", "cant breathe", "cannot breathe", "can not breathe",
      "difficulty breathing", "trouble breathing", "struggling to breathe", "gasping", "difficulty in breathing", "not able to breathe",
      "saans nahi", "sans nahi", "dam ghut", "dam phool", "सांस नहीं", "साँस नहीं", "दम घुट", "दम फूल",
    ],
    groups: [
      ["saans", "sans", "सांस", "साँस", "breath", "breathing"],
      ["phool", "phoolna", "phoolne", "phoolti", "phoolta", "ruk", "rukna", "rukti", "takleef", "dikkat", "problem", "difficulty", "trouble", "tez", "फूल", "फूलना", "फूलने", "फूलती", "रुक", "रुकना", "तकलीफ", "दिक्कत", "परेशानी"],
    ],
    window: 4,
  },
  {
    reason: "face_droop",
    negatable: true,
    phrases: ["face droop", "face drooping", "facial droop", "face is drooping", "drooping face", "crooked smile", "face numb", "face numbness"],
    groups: [
      ["face", "chehra", "chehre", "चेहरा", "चेहरे", "munh", "muh", "mooh", "मुंह", "मुँह", "mouth"],
      ["droop", "drooping", "droops", "drooped", "tedha", "terha", "tedhi", "terhi", "latak", "latka", "latakna", "latakta", "crooked", "numb", "sunn", "टेढ़ा", "टेढ़ी", "लटक", "लटका", "लटकना", "सुन्न", "taraf", "तरफ"],
    ],
    window: 4,
  },
  {
    reason: "slurred_speech",
    negatable: true,
    phrases: [
      "slurred speech", "speech slurred", "slurring", "speech problem", "trouble speaking", "difficulty speaking", "cant speak", "cannot speak",
      "unable to speak", "not able to speak", "bol nahi pa", "bol nahi paa", "bolne mein dikkat", "bolne me dikkat", "bolne mein takleef",
      "bolne mein problem", "bolne mein pareshani", "baat nahi kar pa", "zubaan ladkhada", "zuban ladkhada", "jubaan ladkhada", "awaaz ladkhada",
      "बोल नहीं पा", "बोलने में दिक्कत", "बोलने में तकलीफ", "बोलने में परेशानी", "बात नहीं कर पा", "ज़ुबान लड़खड़ा", "जुबान लड़खड़ा", "आवाज़ लड़खड़ा", "जबान लड़खड़ा",
      "zubaan atak", "जुबान अटक", "बोली अटक", "boli atak",
    ],
  },
  {
    reason: "one_sided_weakness",
    negatable: true,
    phrases: [
      "one sided weakness", "one side weakness", "weakness on one side", "weakness in one side", "numbness on one side", "one side numb", "one side of the body",
      "left side weak", "right side weak", "left side numb", "right side numb", "arm weakness", "arm numb", "arm is weak", "arm went numb",
      "haath kaam nahi", "pair kaam nahi", "hath kaam nahi", "haath uth nahi", "hath uth nahi", "haath nahi utha", "pair nahi utha", "haath pair kaam nahi",
      "हाथ काम नहीं", "पैर काम नहीं", "हाथ उठ नहीं", "हाथ नहीं उठ", "पैर नहीं उठ", "हाथ पैर काम नहीं",
      "lakwa", "laqwa", "lakva", "लकवा", "paralysis", "paralyzed", "paralysed", "paralytic", "पैरालिसिस", "aadha sharir", "adha sharir", "आधा शरीर",
    ],
    groups: [
      ["taraf", "tarf", "तरफ", "side", "half"],
      ["kamzori", "kamzor", "kamjori", "sunn", "sun", "numb", "numbness", "weak", "weakness", "shithil", "कमजोरी", "कमज़ोरी", "कमजोर", "सुन्न", "शिथिल"],
    ],
    window: 4,
  },
  {
    reason: "stroke_suspected",
    negatable: true,
    phrases: [
      "stroke aa gaya", "stroke ho raha", "stroke lag raha", "stroke jaisa", "stroke attack", "brain attack", "having a stroke", "had a stroke just now",
      "stroke symptoms now", "paralytic attack", "स्ट्रोक आ गया", "स्ट्रोक हो रहा", "स्ट्रोक जैसा", "स्ट्रोक अटैक", "स्ट्रोक लग रहा",
    ],
  },
  {
    reason: "sudden_severe_headache",
    negatable: true,
    phrases: ["worst headache", "thunderclap headache", "sudden severe headache", "achanak sir dard", "achanak se sir dard", "अचानक सिर दर्द", "अचानक सिर में दर्द"],
    groups: [
      ["headache", "sir", "sar", "सिर", "सर", "head"],
      ["dard", "pain", "ache", "दर्द"],
      ["sudden", "suddenly", "severe", "worst", "terrible", "unbearable", "thunderclap", "achanak", "achaanak", "tez", "bahut", "zor", "zoron", "asahniy", "bhayankar", "अचानक", "तेज", "तेज़", "बहुत", "ज़ोर", "जोर", "असहनीय", "भयंकर"],
    ],
    window: 6,
  },
  {
    reason: "vision_loss",
    negatable: true,
    phrases: [
      "vision loss", "lost vision", "lost my vision", "sudden blindness", "cant see", "cannot see", "unable to see", "double vision", "sudden blur", "suddenly blurred",
      "dikhai nahi", "dikhta nahi", "dikhna band", "dikh nahi", "kuch dikhai nahi", "ankhon ke aage andhera", "aankhon ke aage andhera", "aankhon ke samne andhera",
      "ankhon ke samne andhera", "ek aankh se nahi", "ek ankh se nahi", "dohra dikhai", "dohra dikh", "double dikh",
      "दिखाई नहीं", "दिखता नहीं", "दिखना बंद", "दिख नहीं", "आंखों के आगे अंधेरा", "आँखों के आगे अंधेरा", "आंखों के सामने अंधेरा", "एक आंख से नहीं", "दोहरा दिखाई",
    ],
  },
  {
    reason: "confusion",
    negatable: true,
    phrases: [
      "papa confused", "he is confused", "she is confused", "he seems confused", "she seems confused", "seems confused", "became confused", "suddenly confused",
      "acting confused", "patient is confused", "is disoriented", "disoriented", "disorientation", "mental confusion", "sudden confusion", "not making sense", "incoherent",
      "behki behki", "behki baatein", "behka hua", "behak", "bahki", "pehchan nahi pa", "pehchaan nahi", "pehchan nahi", "samajh nahi pa", "hosh mein nahi", "hosh me nahi", "sudh budh", "sudhbudh",
      "ulti seedhi baat", "बहकी बहकी", "बहकी बातें", "बहका हुआ", "पहचान नहीं", "समझ नहीं पा", "होश में नहीं", "सुध बुध", "सुधबुध", "उल्टी सीधी बात", "उल्टी सीधी बातें",
    ],
  },
  {
    reason: "fainting",
    negatable: true,
    phrases: [
      "fainted", "fainting", "passed out", "pass out", "lost consciousness", "loss of consciousness", "unconscious", "collapsed", "blacked out", "black out", "fell down",
      "behosh", "behoshi", "hosh kho", "hosh ud", "chakkar aake gir", "chakkar aakar gir", "chakkar khake gir", "achanak gir", "bathroom mein gir", "bathroom me gir",
      "ghar mein gir", "chalte chalte gir", "uthte hi gir", "gir pade", "gir pada", "gir padi", "gir padte",
      "बेहोश", "बेहोशी", "होश खो", "होश उड़", "चक्कर आकर गिर", "चक्कर खाकर गिर", "अचानक गिर", "बाथरूम में गिर", "गिर पड़े", "गिर पड़ा", "गिर पड़ी",
    ],
  },
  {
    reason: "seizure",
    negatable: true,
    phrases: [
      "seizure", "seizures", "convulsion", "convulsions", "convulsing", "having fits", "had fits", "had a fit", "got a fit", "fits aaye", "fit aaya", "epileptic fit",
      "mirgi", "daura pada", "daura pad", "daura aaya", "daura aa gaya", "jhatke aa", "jhatke lag", "body akad", "akad gaya", "akad gayi",
      "मिर्गी", "दौरा पड़ा", "दौरा पड़", "दौरा आया", "दौरा आ गया", "झटके आ", "झटके लग", "शरीर अकड़", "अकड़ गया", "अकड़ गई",
    ],
  },
  {
    reason: "vomiting_blood",
    negatable: true,
    phrases: [
      "vomiting blood", "vomit blood", "vomited blood", "throwing up blood", "blood in vomit", "blood vomit", "hematemesis", "coughing blood", "coughing up blood", "cough blood",
      "khoon ki ulti", "khoon ki ultiyan", "ulti mein khoon", "ulti me khoon", "khoon ki khansi", "khoon thook", "खून की उल्टी", "उल्टी में खून", "खून की खांसी", "खून थूक",
    ],
    groups: [["ulti", "vomit", "vomiting", "vomited", "उल्टी"], ["khoon", "blood", "खून"]],
    window: 4,
  },
  {
    reason: "severe_bleeding",
    negatable: true,
    phrases: [
      "severe bleeding", "heavy bleeding", "profuse bleeding", "uncontrolled bleeding", "bleeding wont stop", "bleeding will not stop", "bleeding nonstop", "bleeding non stop",
      "blood wont stop", "khoon nahi ruk", "khoon bahut beh", "khoon bahut nikal", "khoon beh raha", "khoon nikal raha", "khoon aa raha", "black stool", "tarry stool", "kala mal", "kale rang ka mal",
      "खून नहीं रुक", "खून बहुत", "खून बह रहा", "खून निकल रहा", "खून आ रहा", "काला मल", "काले रंग का मल",
    ],
  },
  {
    reason: "unresponsive",
    negatable: true,
    phrases: [
      "not responding", "unresponsive", "wont wake", "will not wake", "cannot wake", "cant wake", "unable to wake", "not waking", "not waking up",
      "uth nahi raha", "nahi uth raha", "jag nahi raha", "jaag nahi raha", "respond nahi", "jawab nahi de", "hilta nahi", "hil nahi raha", "hosh nahi aa raha",
      "उठ नहीं रहे", "उठ नहीं रहा", "जाग नहीं रहे", "जाग नहीं रहा", "जवाब नहीं दे", "हिल नहीं रहे", "हिल नहीं रहा", "होश नहीं आ रहा",
    ],
  },
];

interface CompiledRule {
  reason: EmergencyReason;
  phrases: string[][];
  groups: Set<string>[];
  window: number;
  negatable: boolean;
}

function compile(r: EmergencyRule): CompiledRule {
  return {
    reason: r.reason,
    phrases: (r.phrases ?? []).map((p) => fold(p).split(" ").filter(Boolean)),
    groups: (r.groups ?? []).map((g) => new Set(g.map((w) => fold(w)))),
    window: r.window ?? 4,
    negatable: Boolean(r.negatable),
  };
}

const RULES = RULES_SRC.map(compile);

const NEGATORS = new Set(
  ["no", "not", "nahi", "nahin", "nhi", "nai", "without", "bina", "never", "koi", "nope", "नहीं", "नही", "बिना", "कोई", "ना", "na", "none", "nothing"].map((w) => fold(w)),
);

const BREAKERS = new Set(["and", "or", "but", "aur", "par", "lekin", "magar", "तो", "और", "पर", "लेकिन", "मगर"].map((w) => fold(w)));

function negated(tokens: string[], start: number, end: number): boolean {
  // A negator just before ("no chest pain", "koi dard nahi") or just after
  // ("chest pain nahi hai"), never across a conjunction ("... confused and not recognising").
  for (let i = start - 1; i >= Math.max(0, start - 2); i--) {
    if (BREAKERS.has(tokens[i])) break;
    if (NEGATORS.has(tokens[i])) return true;
  }
  for (let i = end + 1; i <= Math.min(tokens.length - 1, end + 2); i++) {
    if (BREAKERS.has(tokens[i])) break;
    if (NEGATORS.has(tokens[i])) return true;
  }
  return false;
}

function findPhrase(tokens: string[], phrase: string[]): Array<[number, number]> {
  const hits: Array<[number, number]> = [];
  if (phrase.length === 0) return hits;
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < phrase.length; j++) {
      if (tokens[i + j] !== phrase[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push([i, i + phrase.length - 1]);
  }
  return hits;
}

function findGroups(tokens: string[], groups: Set<string>[], window: number): Array<[number, number]> {
  if (groups.length === 0) return [];
  const positions = groups.map((g) => {
    const p: number[] = [];
    tokens.forEach((t, i) => {
      if (g.has(t)) p.push(i);
    });
    return p;
  });
  if (positions.some((p) => p.length === 0)) return [];
  const hits: Array<[number, number]> = [];
  // Anchor on each position of the first group; for the others pick the closest hit.
  for (const a of positions[0]) {
    let lo = a;
    let hi = a;
    let ok = true;
    for (let g = 1; g < positions.length; g++) {
      let best = -1;
      for (const p of positions[g]) {
        if (p === a) continue;
        if (best === -1 || Math.abs(p - a) < Math.abs(best - a)) best = p;
      }
      if (best === -1) {
        ok = false;
        break;
      }
      lo = Math.min(lo, best);
      hi = Math.max(hi, best);
    }
    if (ok && hi - lo <= window) hits.push([lo, hi]);
  }
  return hits;
}

export function detectEmergency(message: string): EmergencyReason[] {
  const tokens = fold(message).split(" ").filter(Boolean);
  const found = new Set<EmergencyReason>();
  for (const rule of RULES) {
    const spans: Array<[number, number]> = [];
    for (const p of rule.phrases) spans.push(...findPhrase(tokens, p));
    spans.push(...findGroups(tokens, rule.groups, rule.window));
    for (const [s, e] of spans) {
      if (rule.negatable && negated(tokens, s, e)) continue;
      found.add(rule.reason);
    }
  }
  return Array.from(found);
}

// ---------------------------------------------------------------------------
// Medicine-change / diagnosis / remember requests
// ---------------------------------------------------------------------------

const MED_NOUNS = new Set(
  [
    "dose", "doses", "dosage", "medicine", "medicines", "medication", "tablet", "tablets", "pill", "pills", "dawai", "dawa", "davai", "dawaai", "goli", "goliyan", "dawaiyan",
    "khurak", "insulin", "aspirin", "statin", "दवा", "दवाई", "दवाइयाँ", "दवाइयां", "गोली", "गोलियां", "डोज़", "डोज", "खुराक", "इंसुलिन",
  ].map((w) => fold(w)),
);
const CHANGE_VERBS = new Set(
  [
    "start", "stop", "change", "increase", "decrease", "reduce", "double", "halve", "skip", "quit", "discontinue", "restart", "switch", "adjust", "lower", "raise",
    "shuru", "band", "bandh", "badha", "badhao", "badhana", "badhau", "badhaun", "ghata", "ghatana", "ghatao", "chhod", "chhodna", "chhodu", "chod", "badal", "badalna", "badlu", "kam", "rok", "rokna", "roku",
    "शुरू", "बंद", "रोक", "रोकना", "बढ़ा", "बढ़ाना", "बढ़ाऊं", "बढ़ाऊँ", "घटा", "घटाना", "छोड़", "छोड़ना", "छोड़ूं", "बदल", "बदलना", "कम",
  ].map((w) => fold(w)),
);
const DRUG_NAMES = new Set(
  [
    "paracetamol", "crocin", "aspirin", "disprin", "ibuprofen", "combiflam", "diclofenac", "antibiotic", "steroid", "insulin", "statin", "atorvastatin", "amlodipine",
    "telmisartan", "losartan", "metoprolol", "clopidogrel", "warfarin", "ecosprin", "ayurvedic", "herbal", "supplement", "supplements", "vitamin", "ashwagandha", "jadi", "kadha",
  ].map((w) => fold(w)),
);
const TAKE_VERBS = new Set(["take", "taking", "le", "lena", "lu", "leni", "khana", "khaun", "khalu", "sakta", "sakte", "sakti", "ले", "लेना", "लूं", "खाना", "सकता", "सकते"].map((w) => fold(w)));
/** "amlodipine KAB leni hai", "amlodipine le li kya": asking WHEN it is taken, or whether it was, changes nothing. */
const TIMING_OR_PAST = new Set(
  ["kab", "kitne", "baje", "when", "time", "samay", "schedule", "timing", "li", "liya", "lee", "thi", "tha", "taken", "took", "कब", "कितने", "बजे", "समय", "ली", "लिया", "थी", "था"].map((w) => fold(w)),
);

export function detectMedicineChangeRequest(message: string): boolean {
  const tokens = fold(message).split(" ").filter(Boolean);
  const f = tokens.join(" ");
  const phrases = ["extra dose", "double dose", "ek aur goli", "ek aur dawai", "aur ek goli", "extra goli", "extra tablet", "dose badha", "dose kam", "dose double", "एक और गोली", "एक और दवा", "डोज़ बढ़ा", "डोज़ कम"];
  if (phrases.some((p) => ` ${f} `.includes(` ${fold(p)} `))) return true;
  for (let i = 0; i < tokens.length; i++) {
    if (MED_NOUNS.has(tokens[i])) {
      for (let j = Math.max(0, i - 4); j <= Math.min(tokens.length - 1, i + 4); j++) {
        if (j !== i && CHANGE_VERBS.has(tokens[j])) return true;
      }
    }
    if (DRUG_NAMES.has(tokens[i])) {
      const timing = tokens.some((t) => TIMING_OR_PAST.has(t));
      for (let j = Math.max(0, i - 4); j <= Math.min(tokens.length - 1, i + 4); j++) {
        if (CHANGE_VERBS.has(tokens[j])) return true;
        if (TAKE_VERBS.has(tokens[j]) && !timing) return true;
      }
    }
  }
  return false;
}

const DIAGNOSIS_PHRASES = [
  "diagnose", "diagnosis", "do i have", "does he have", "does she have", "does papa have", "is it stroke", "is this stroke", "is it a stroke", "is it diabetes", "is it cancer",
  "is it a heart attack", "ko diabetes hai", "ko stroke hai", "ko cancer hai", "ko heart problem", "mujhe diabetes", "konsi bimari", "kaunsi bimari", "kya bimari hai", "kya bimaari hai",
  "bimari ka naam", "kya yeh stroke", "kya ye stroke", "kya yeh diabetes", "kya ye diabetes",
  "क्या मुझे", "कौनसी बीमारी", "कौन सी बीमारी", "क्या बीमारी है", "बीमारी का नाम", "डायग्नोसिस", "डायग्नोज़", "को डायबिटीज़ है", "को डायबिटीज है", "को स्ट्रोक है", "को कैंसर है",
].map((p) => fold(p));

/** Conditions a family may ask "does he have ...?" about. Whole tokens, folded. */
const DISEASE_WORDS = new Set(
  [
    "diabetes", "diabetic", "cancer", "stroke", "thyroid", "kidney", "tb", "dementia", "alzheimer", "alzheimers", "parkinson", "parkinsons", "anemia", "anaemia", "infection", "covid", "dengue", "malaria", "typhoid", "arthritis", "hypertension",
    "डायबिटीज़", "डायबिटीज", "शुगर की बीमारी", "कैंसर", "स्ट्रोक", "थायरॉइड", "किडनी", "टीबी", "डिमेंशिया", "अल्ज़ाइमर", "अल्जाइमर", "पार्किंसन", "एनीमिया", "इन्फेक्शन", "कोविड", "डेंगू", "मलेरिया", "टाइफाइड", "गठिया", "हाइपरटेंशन",
  ].map((w) => fold(w)),
);
/** What follows a condition name when the question is "does he have it?" (word order varies in Hinglish). */
const HAS_AFTER = [
  "hai kya", "hain kya", "hai ya nahi", "hua kya", "hua hai kya", "ho gaya kya", "ho gayi kya", "to nahi", "toh nahi", "ho sakta hai", "ho sakti hai", "lagta hai", "lag raha hai", "ka khatra", "ka risk", "hone ka",
  "है क्या", "हैं क्या", "है या नहीं", "हुआ क्या", "हो गया क्या", "तो नहीं", "हो सकता है", "लगता है", "का खतरा", "का ख़तरा", "होने का",
].map((p) => fold(p));

export function detectDiagnosisRequest(message: string): boolean {
  const tokens = fold(message).split(" ").filter(Boolean);
  const f = ` ${tokens.join(" ")} `;
  const asking = /[?？]/.test(message) || tokens.includes("kya") || tokens.includes("क्या");
  for (const p of DIAGNOSIS_PHRASES) {
    if (!f.includes(` ${p} `)) continue;
    // "papa ko diabetes hai, BP kitna hai" states a fact; only "ko X hai ... kya/?" asks whether he has it.
    if (/^(?:ko|को) /.test(p) && !asking) continue;
    return true;
  }
  for (let i = 0; i < tokens.length; i++) {
    if (!DISEASE_WORDS.has(tokens[i])) continue;
    const after = ` ${tokens.slice(i + 1, i + 5).join(" ")} `;
    if (HAS_AFTER.some((p) => after.includes(` ${p} `))) return true;
    // "kya papa ko diabetes hai": a question word just before the condition and "hai" right after.
    const before = tokens.slice(Math.max(0, i - 4), i);
    if ((before.includes("kya") || before.includes("क्या")) && /^(?:hai|hain|hua|hui|है|हैं|हुआ|हुई)$/.test(tokens[i + 1] ?? "")) return true;
  }
  return false;
}

const REMEMBER_PHRASES = [
  "remember that", "remember this", "please remember", "yaad rakho", "yaad rakh", "yaad rakhna", "yaad rakhiye", "note kar", "note karo", "note kar lo", "save kar", "save karo", "save this", "add to memory",
  "याद रखो", "याद रख", "याद रखना", "याद रखिए", "नोट कर", "नोट करो", "सेव कर", "सेव करो",
].map((p) => fold(p));

export function detectRememberRequest(message: string): boolean {
  const f = ` ${fold(message)} `;
  return REMEMBER_PHRASES.some((p) => f.includes(` ${p} `));
}

// ---------------------------------------------------------------------------
// Prompt-injection hygiene
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous\s+|prior\s+|above\s+|earlier\s+|system\s+)?(?:instructions?|prompts?|rules?|guidelines?)/gi,
  /disregard\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous\s+|prior\s+|above\s+|earlier\s+)?(?:instructions?|prompts?|rules?|guidelines?)/gi,
  /forget\s+(?:all\s+|everything\s+|your\s+|the\s+)[^.\n]{0,40}(?:instructions?|rules?|prompt)/gi,
  /(?:reveal|show|print|repeat|leak|display)\s+(?:me\s+)?(?:your\s+|the\s+)?(?:system\s+)?(?:prompt|instructions)/gi,
  /you\s+are\s+now\b|pretend\s+(?:to\s+be|you\s+are)|\bact\s+as\b|developer\s+mode|jailbreak|do\s+anything\s+now|\bDAN\b/gi,
  /(?:^|\s)system\s*:|<\/?\s*(?:system|assistant|user|instructions?|user_question|data)\s*>|\[\/?(?:INST|SYSTEM)\]/gi,
  /(?:pichle|purane|sabhi|saare|sare)\s+(?:saare\s+|sabhi\s+)?(?:instructions?|nirdesh|niyam)\s+(?:ignore|bhul|bhool|andekha)/gi,
  /(?:instructions?|nirdesh)\s+(?:ignore|bhul|bhool)\s*(?:karo|kar\s*do|jao)?/gi,
  /system\s+prompt\s+(?:batao|dikhao|bata\s*do)/gi,
  /(?:सभी|सारे|पिछले)\s+निर्देश(?:ों)?\s+(?:को\s+)?(?:भूल|अनदेखा|इग्नोर)/g,
  /सिस्टम\s*प्रॉम्प्ट/g,
];

export function neutraliseInjection(text: string): { text: string; detected: boolean } {
  let out = text;
  let detected = false;
  for (const re of INJECTION_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(out)) {
      detected = true;
      re.lastIndex = 0;
      out = out.replace(re, " [निर्देश-जैसा टेक्स्ट हटाया गया] ");
    }
  }
  // Angle brackets could close the delimiter tags we wrap user text in.
  out = out.replace(/[<>]/g, " ");
  return { text: out.replace(/\s+/g, " ").trim(), detected };
}

// ---------------------------------------------------------------------------
// Crisis readings
// ---------------------------------------------------------------------------

// "150/95" typed, or "150 by 95" / "150 बाय 95" / "150 over 95" as speech recognition writes it.
const BP_PAIR = /(?:^|[^\d./])(\d{2,3})(?:\s*[/\\]\s*|\s+(?:by|over|upon|बाय|बटा|बटे|ओवर)\s+)(\d{2,3})(?!\d)/gi;

/** BP readings the user typed into the message, e.g. "BP 190/125 aa raha hai". */
export function readingsInMessage(message: string): Array<{ systolic: number; diastolic: number }> {
  const text = normalizeDigits(message);
  const out: Array<{ systolic: number; diastolic: number }> = [];
  BP_PAIR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BP_PAIR.exec(text)) !== null) {
    const systolic = Number(m[1]);
    const diastolic = Number(m[2]);
    if (isPlausibleBP(systolic, diastolic)) out.push({ systolic, diastolic });
  }
  return out;
}

export interface SafetyOptions {
  latestBP?: BPRecord | null;
  thresholds?: BPThresholds;
  now?: Date;
}

const DAY_MS = 86_400_000;

export function assessSafety(message: string, opts: SafetyOptions = {}): SafetyAssessment {
  const thresholds = opts.thresholds ?? DEFAULT_BP_THRESHOLDS;
  const now = opts.now ?? new Date();
  const cleaned = sanitizeText(message);
  const { text: sanitized, detected } = neutraliseInjection(cleaned);

  // Emergency detection runs on the CLEANED text, before neutralisation, so an
  // attacker cannot hide a real symptom report behind injection phrases.
  const emergencyReasons = detectEmergency(cleaned);

  let crisis: CrisisReading | null = null;
  const latest = opts.latestBP ?? null;
  if (latest) {
    const ageMs = now.getTime() - new Date(latest.at).getTime();
    if (ageMs >= 0 && ageMs <= DAY_MS) {
      const c = classifyBP(latest.systolic, latest.diastolic, thresholds);
      if (c.category === "crisis" || (c.category === "low" && c.needsUrgentAttention)) {
        crisis = {
          ref: latest.ref,
          systolic: latest.systolic,
          diastolic: latest.diastolic,
          at: latest.at,
          source: "log",
          kind: c.category === "low" ? "low" : "high",
        };
      }
    }
  }
  if (!crisis) {
    for (const r of readingsInMessage(cleaned)) {
      const c = classifyBP(r.systolic, r.diastolic, thresholds);
      if (c.category === "crisis") {
        crisis = { ref: "user_message", systolic: r.systolic, diastolic: r.diastolic, at: null, source: "user_message", kind: "high" };
        break;
      }
    }
  }

  return {
    sanitized,
    emergency: emergencyReasons.length > 0,
    emergencyReasons,
    medicineChangeRequest: detectMedicineChangeRequest(cleaned),
    diagnosisRequest: detectDiagnosisRequest(cleaned),
    injectionDetected: detected,
    crisisReading: crisis,
    rememberRequest: detectRememberRequest(cleaned),
  };
}

// ---------------------------------------------------------------------------
// Deterministic emergency answer
// ---------------------------------------------------------------------------

const REASON_HI: Record<EmergencyReason, string> = {
  chest_pain: "सीने/छाती में दर्द या जकड़न",
  breathless: "साँस लेने में तकलीफ़",
  face_droop: "चेहरा टेढ़ा होना",
  slurred_speech: "बोलने में दिक्कत",
  one_sided_weakness: "एक तरफ़ की कमज़ोरी या सुन्नपन",
  sudden_severe_headache: "अचानक तेज़ सिर दर्द",
  vision_loss: "दिखाई देने में अचानक दिक्कत",
  confusion: "भ्रम / पहचान न पाना",
  fainting: "बेहोशी या गिर पड़ना",
  seizure: "दौरा / झटके",
  vomiting_blood: "खून की उल्टी या खाँसी",
  severe_bleeding: "तेज़ या न रुकने वाला खून बहना",
  unresponsive: "जवाब न देना / जगाने पर न उठना",
  stroke_suspected: "स्ट्रोक जैसे लक्षण",
};

const REASON_EN: Record<EmergencyReason, string> = {
  chest_pain: "chest pain or tightness",
  breathless: "difficulty breathing",
  face_droop: "face drooping",
  slurred_speech: "trouble speaking",
  one_sided_weakness: "one-sided weakness or numbness",
  sudden_severe_headache: "sudden severe headache",
  vision_loss: "sudden vision problems",
  confusion: "confusion",
  fainting: "fainting or collapse",
  seizure: "seizure",
  vomiting_blood: "vomiting or coughing blood",
  severe_bleeding: "severe bleeding",
  unresponsive: "not responding",
  stroke_suspected: "possible stroke signs",
};

export function formatBPAgo(r: Pick<BPRecord, "systolic" | "diastolic" | "date" | "time">): { hi: string; en: string } {
  return {
    hi: `${r.systolic}/${r.diastolic} mmHg (${formatDateHi(r.date)}, ${r.time})`,
    en: `${r.systolic}/${r.diastolic} mmHg (${formatDateEn(r.date)}, ${r.time})`,
  };
}

/**
 * The fixed emergency response. Numbers in it come from code (the user's latest
 * logged reading, if any), never from a model.
 */
export function buildEmergencyAnswer(
  reasons: EmergencyReason[],
  latestBP: BPRecord | null,
  range: { from: string; to: string },
): AnswerDraft {
  const hi = reasons.map((r) => REASON_HI[r]).join(", ");
  const en = reasons.map((r) => REASON_EN[r]).join(", ");
  const bp = latestBP ? formatBPAgo(latestBP) : null;
  const strokeLike = reasons.some((r) => ["face_droop", "slurred_speech", "one_sided_weakness", "stroke_suspected", "vision_loss", "confusion", "sudden_severe_headache"].includes(r));

  const answer_hi =
    `आपके बताए लक्षण (${hi}) आपातकालीन हो सकते हैं। ऐप के जवाब का इंतज़ार न करें: अभी 112 या 108 पर कॉल करें, या तुरंत नज़दीकी अस्पताल की इमरजेंसी पहुँचें।\n` +
    `लक्षण कब शुरू हुए, वह समय नोट कर लें और एम्बुलेंस/डॉक्टर को बताएँ। मरीज़ को आराम से बैठाकर या लिटाकर रखें, अकेला न छोड़ें। ` +
    `एम्बुलेंस या डॉक्टर के कहे बिना खाना, पानी या कोई दवा न दें।` +
    (strokeLike ? `\nस्ट्रोक के संकेत (FAST): चेहरा टेढ़ा, बाँह कमज़ोर, बोलने में दिक्कत — दिखे तो तुरंत कॉल का समय (Time to call) है।` : "") +
    (bp ? `\nऐप में आख़िरी दर्ज BP: ${bp.hi}।` : "");
  const answer_en =
    `The symptoms you describe (${en}) can be an emergency. Do not wait for this app: call 112 or 108 now, or go to the nearest hospital emergency department.\n` +
    `Note the time the symptoms started and tell the ambulance crew or doctor. Keep the patient resting, do not leave them alone, and give no food, water or medicine unless the ambulance crew or a doctor says so.` +
    (strokeLike ? `\nStroke signs (FAST): Face drooping, Arm weakness, Speech difficulty: if you see them, it is Time to call.` : "") +
    (bp ? `\nLast BP logged in the app: ${bp.en}.` : "");

  return {
    headline: "तुरंत 112 / 108 पर कॉल करें",
    answer_hi,
    answer_en,
    key_points: [
      { text: "लक्षण आपातकालीन हो सकते हैं: ऐप का इंतज़ार न करें, अभी कॉल करें। / These can be an emergency: call now.", fact_refs: [] },
      { text: "लक्षण शुरू होने का समय नोट करें। / Note the time the symptoms began.", fact_refs: [] },
      ...(latestBP && bp ? [{ text: `आख़िरी दर्ज BP: ${bp.hi}`, fact_refs: [latestBP.ref] }] : []),
    ],
    numbers: latestBP
      ? [
          { label: "आख़िरी सिस्टोलिक BP", value: latestBP.systolic, unit: "mmHg", ref: latestBP.ref },
          { label: "आख़िरी डायस्टोलिक BP", value: latestBP.diastolic, unit: "mmHg", ref: latestBP.ref },
        ]
      : [],
    recommendations: [
      { text: "112 या 108 पर कॉल करें / नज़दीकी इमरजेंसी जाएँ।", kind: "urgent", basis: "general", source_urls: [] },
      { text: "लक्षण शुरू होने का समय नोट करें और डॉक्टर को बताएँ।", kind: "urgent", basis: "general", source_urls: [] },
    ],
    sources: [],
    confidence: "high",
    data_coverage: { metrics: latestBP ? ["bp"] : [], range, n: latestBP ? 1 : 0 },
    needs_doctor: true,
    safety_level: "escalate",
    follow_up_questions: [],
    refusal: "",
  };
}

/** Sentence that must open an answer when the latest reading is in the crisis range. */
export function crisisLeadText(c: CrisisReading, lang: "hi" | "en"): string {
  const reading = `${c.systolic}/${c.diastolic} mmHg`;
  if (c.kind === "low") {
    return lang === "hi"
      ? `ध्यान दें: ${c.source === "log" ? "आख़िरी दर्ज" : "आपका बताया"} BP ${reading} बहुत कम है। अगर चक्कर, कमज़ोरी या बेहोशी जैसा लगे तो तुरंत 112/108 पर कॉल करें, वरना जल्दी डॉक्टर से बात करें।`
      : `Important: the ${c.source === "log" ? "last logged" : "reported"} BP of ${reading} is very low. If there is dizziness, weakness or fainting, call 112/108 now; otherwise speak to the doctor soon.`;
  }
  return lang === "hi"
    ? `ध्यान दें: ${c.source === "log" ? "आख़िरी दर्ज" : "आपका बताया"} BP ${reading} क्राइसिस रेंज में है। 5 मिनट आराम के बाद दोबारा नापें; अगर तब भी इतना ही ज़्यादा हो, या सिरदर्द, सीने में दर्द, साँस फूलना, कमज़ोरी, बोलने/देखने में दिक्कत हो, तो तुरंत 112/108 पर कॉल करें और डॉक्टर को बताएँ।`
    : `Important: the ${c.source === "log" ? "last logged" : "reported"} BP of ${reading} is in the crisis range. Rest 5 minutes and measure again; if it is still this high, or there is headache, chest pain, breathlessness, weakness, or trouble speaking or seeing, call 112/108 now and tell the doctor.`;
}
