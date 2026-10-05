/**
 * "Asked one thing, answered another": routing evaluation for the rules engine.
 *
 * Every case is a real question a family member would type (Hindi, Hinglish,
 * English, Devanagari). It asserts WHAT THE ANSWER IS ABOUT: the intent, the
 * metrics it touched, and that data for some other topic is absent. Numbers are
 * checked against small independent oracles, not against the code under test.
 */

import { buildLedger } from "../ledger";
import { answerWithRules } from "../fallback";
import { detectAdviceQuestion, detectScheduleQuestion } from "../scope";
import { detectDiagnosisRequest } from "../safety";
import type { Metric, PatientContext } from "../types";
import { caseOf, type EvalCase } from "./harness";
import { FIXTURE_TODAY, fixture, type ArchetypeId } from "./fixtures";

const T = FIXTURE_TODAY;

interface Route {
  q: string;
  /** Prefix of the intent the engine must report. */
  intent: string;
  arch?: ArchetypeId;
  /** The EXACT set of tracked metrics the answer may touch (order-free). Omit for non-data answers. */
  metrics?: Metric[];
  has?: Array<string | ((c: PatientContext) => string)>;
  not?: string[];
  needsDoctor?: boolean;
}

/** Strings that only appear when patient data is dumped into the answer. */
const DATA_DUMP = ["mmHg", "kcal", "Mean ", "steps/day", "readings"];

const ROUTES: Route[] = [
  // --- not a health question: never answer with patient data ---------------------------
  { q: "aaj mausam kaisa hai", intent: "out_of_scope", metrics: [], not: DATA_DUMP },
  { q: "who is the prime minister", intent: "out_of_scope", metrics: [], not: DATA_DUMP },
  { q: "kal ka cricket match kaun jeeta", intent: "out_of_scope", metrics: [], not: DATA_DUMP },
  { q: "आज बारिश कैसी है", intent: "out_of_scope", metrics: [], not: DATA_DUMP },
  { q: "hi", intent: "greeting", metrics: [], not: DATA_DUMP },
  { q: "hello kaise ho", intent: "greeting", metrics: [], not: DATA_DUMP },
  { q: "नमस्ते", intent: "greeting", metrics: [], not: DATA_DUMP },
  { q: "thanks", intent: "thanks", metrics: [], not: DATA_DUMP },
  { q: "shukriya", intent: "thanks", metrics: [], not: DATA_DUMP },
  { q: "papa ka naam kya hai", intent: "unrecognised", metrics: [], not: DATA_DUMP },
  { q: "kal ka kya tha", intent: "clarify_topic", metrics: [], not: DATA_DUMP },

  // --- the app does not track it: say so, show nothing else ----------------------------
  { q: "sugar kitni hai", intent: "untracked:blood_sugar", metrics: [], has: ["not recorded"], not: DATA_DUMP },
  { q: "sugar level kaisa hai papa ka", intent: "untracked:blood_sugar", metrics: [], has: ["not recorded"], not: DATA_DUMP },
  { q: "शुगर कितनी है", intent: "untracked:blood_sugar", metrics: [], not: DATA_DUMP },
  { q: "cholesterol kitna hai", intent: "untracked:cholesterol", metrics: [], not: DATA_DUMP },
  { q: "oxygen level kya hai", intent: "untracked:oxygen", metrics: [], not: DATA_DUMP },
  { q: "thyroid ki report batao", intent: "untracked:lab_tests", metrics: [], not: DATA_DUMP },
  { q: "doctor ka number kya hai", intent: "untracked:appointments", metrics: [], not: DATA_DUMP },
  { q: "BP aur sugar dono batao", intent: "latest:bp", metrics: ["bp"], has: ["blood sugar is not recorded"] },

  // --- advice, whatever the word order -------------------------------------------------
  { q: "BP kam kaise karein", intent: "advice_limited", has: ["advice question"] },
  { q: "kaise karein BP kam", intent: "advice_limited", has: ["advice question"] },
  { q: "weight kam kaise karein", intent: "advice_limited", metrics: ["weight"], has: ["advice question"] },
  { q: "salt kam karna chahiye kya", intent: "advice_limited", metrics: ["food"] },
  { q: "kela kha sakte hain", intent: "advice_limited", metrics: ["food"] },
  { q: "can he eat banana", intent: "advice_limited", metrics: ["food"] },
  { q: "exercise kitni karni chahiye", intent: "advice_limited", metrics: ["steps"] },
  { q: "BP high ho to kya karein", intent: "advice_limited", metrics: ["bp"] },
  { q: "sugar kam kaise karein", intent: "advice_limited", metrics: [], not: ["mmHg"], has: ["not recorded"] },
  // ... and these look like advice but are data questions
  { q: "kya aap bata sakte hain BP kitna tha aaj", intent: "value:bp", metrics: ["bp"] },
  { q: "kal papa ne kya khana khaya", intent: "value:food", metrics: ["food"] },
  { q: "BP kitna hona chahiye", intent: "goal_gap", metrics: ["bp"], has: ["target is below 130/80"] },
  { q: "kya papa ka BP control mein hai", intent: "goal_gap", metrics: ["bp"] },
  { q: "BP kaise raha pichle hafte", intent: "average:bp", metrics: ["bp"] },

  // --- a reading the user typed is classified, never swapped for a logged one ---------
  { q: "mera BP 150/95 hai kya karu", intent: "typed_reading", metrics: ["bp"], has: ["You mentioned a BP of 150/95", "not saved in the app", "High (stage 2)"], needsDoctor: true },
  { q: "BP 118/76 aaya aaj subah", intent: "typed_reading", metrics: ["bp"], has: ["BP of 118/76"] },
  { q: "15/08 ko BP kya tha", intent: "value:bp", metrics: ["bp"] },

  // --- medicines: the plan vs the record ------------------------------------------------
  { q: "papa kaun si dawai khate hain", intent: "medicine_schedule", metrics: ["medicine"], has: ["Amlodipine 5 mg", "Clopidogrel 75 mg", "Atorvastatin 20 mg"], not: ["Adherence"] },
  { q: "dawai kab leni hai", intent: "medicine_schedule", metrics: ["medicine"], has: ["08:00", "14:00", "21:00"] },
  { q: "amlodipine kab leni hai", intent: "medicine_schedule", metrics: ["medicine"], has: ["Amlodipine"], not: ["Clopidogrel", "Atorvastatin"] },
  { q: "amlodepine li kya aaj", intent: "value:medicine", metrics: ["medicine"], has: ["Amlodipine"], not: ["Clopidogrel", "Atorvastatin"] },
  { q: "metformin kab leni hai", intent: "medicine_schedule", metrics: ["medicine"], has: ["not among the recorded medicines"] },
  { q: "kal kitne baje dawai li", intent: "value:medicine", metrics: ["medicine"], not: ["recorded:"] },
  { q: "aaj ki dawai kaunsi baaki hai", intent: "value:medicine", metrics: ["medicine"], has: ["pending"], not: ["What is missing"] },
  { q: "is hafte dawa palan kaisa raha", intent: "average:medicine", metrics: ["medicine"] },

  // --- English words that are not Hinglish words ---------------------------------------
  { q: "so what is the BP today", intent: "value:bp", metrics: ["bp"], not: ["Sleep", "sleep"] },
  { q: "papa so rahe hain kya", intent: "latest:sleep", metrics: ["sleep"] },
  { q: "BP going up or down", intent: "trend:bp", metrics: ["bp"] },

  // --- highest / lowest and WHEN --------------------------------------------------------
  { q: "sabse zyada BP kab tha", intent: "extreme:bp", metrics: ["bp"], has: ["Highest BP", (c) => `${Math.max(...c.bp.map((r) => r.systolic))}/`], not: ["Lowest"] },
  { q: "sabse kam weight kab tha", intent: "extreme:weight", metrics: ["weight"], has: ["Lowest weight", (c) => `${Math.min(...c.weight.map((r) => r.kg))} kg`], not: ["Highest"] },
  { q: "highest steps this week", intent: "extreme:steps", metrics: ["steps"], has: ["Highest steps"] },

  // --- symptoms and diagnosis -----------------------------------------------------------
  { q: "papa ko chakkar aa raha hai", intent: "symptom_mention", metrics: ["bp"], has: ["cannot assess symptoms", "112/108"], needsDoctor: true },
  { q: "diabetes hai kya", intent: "diagnosis_refusal", metrics: [], has: ["cannot diagnose", "Hypertension"], not: ["mmHg"], needsDoctor: true },
  { q: "kya papa ko diabetes hai", intent: "diagnosis_refusal", metrics: [], not: ["mmHg"], needsDoctor: true },
  { q: "stroke history hai kya", intent: "diagnosis_refusal", has: ["Stroke (history)"], needsDoctor: true },
  { q: "diabetes ke liye kya khana chahiye", intent: "advice_limited" },

  // --- summaries and gaps ---------------------------------------------------------------
  { q: "papa kaise hain", intent: "daily_summary" },
  { q: "kya kuch miss hua is hafte", intent: "missing", has: ["What is missing"] },
  { q: "what was his blood pressure yesterday", intent: "value:bp", metrics: ["bp"] },
  { q: "पिछले 7 दिन का औसत BP क्या रहा?", intent: "average:bp", metrics: ["bp"] },
  { q: "namak kitna khaya papa ne", intent: "value:food", metrics: ["food"] },
  { q: "kitne ghante soye raat ko", intent: "value:sleep", metrics: ["sleep"] },
  { q: "aaj kitne kadam chale", intent: "value:steps", metrics: ["steps"] },
  { q: "wajan kitna hai", intent: "value:weight", metrics: ["weight"] },
];

/**
 * The same questions in every way a family actually asks: Devanagari Hindi, English, Hinglish, and the
 * lower-case, punctuation-free, Devanagari-with-English-words text that voice input produces.
 * Frozen from a reviewed run: each pair is [question, intent prefix].
 */
const LANGUAGE_ROUTES: Array<[string, string]> = [
  // Devanagari Hindi (as typed or dictated)
  ["आज का बीपी कितना है", "value:bp"],
  ["पापा का ब्लड प्रेशर कितना है", "value:bp"],
  ["कल का बीपी क्या था", "value:bp"],
  ["पिछले हफ्ते का औसत ब्लड प्रेशर बताओ", "average:bp"],
  ["बीपी कैसे कम करें", "advice_limited"],
  ["बीपी कम करने के लिए क्या खाना चाहिए", "advice_limited"],
  ["पापा ने कल क्या खाया", "value:food"],
  ["आज नाश्ते में क्या खाया", "value:food"],
  ["नमक कितना खाया पापा ने", "value:food"],
  ["आज कितनी कैलोरी ली", "value:food"],
  ["पापा कितने घंटे सोए", "value:sleep"],
  ["आज कितने कदम चले", "value:steps"],
  ["वजन कितना है", "value:weight"],
  ["वज़न कितना बढ़ा पिछले महीने", "trend:weight"],
  ["दवाई ली या नहीं आज", "adherence:medicine"],
  ["कौन सी दवाई कब लेनी है", "medicine_schedule"],
  ["आज कौन सी दवाई बाकी है", "value:medicine"],
  ["इस हफ्ते दवा कितनी छूटी", "adherence:medicine"],
  ["पापा आज कैसे हैं", "daily_summary"],
  ["इस महीने का हाल बताओ पापा का", "period_summary"],
  ["शुगर कितनी है", "untracked:blood_sugar"],
  ["आज मौसम कैसा है", "out_of_scope"],
  ["दवा बंद कर दूं क्या", "medicine_change_refusal"],
  ["क्या पापा को डायबिटीज है", "diagnosis_refusal"],
  ["मेरा बीपी 150 बाय 95 है क्या करूं", "typed_reading"],
  ["पापा को चक्कर आ रहे हैं", "symptom_mention"],
  // English
  ["what is his blood pressure today", "value:bp"],
  ["average bp last 7 days", "average:bp"],
  ["how can I lower his blood pressure", "advice_limited"],
  ["what did he eat yesterday", "value:food"],
  ["how many steps did he walk today", "value:steps"],
  ["did he take his medicines today", "value:medicine"],
  ["which medicines does he take", "medicine_schedule"],
  ["what is his weight", "latest:weight"],
  ["how is papa doing today", "daily_summary"],
  ["what changed compared to last week", "compare"],
  ["what is missing this week", "missing"],
  ["is his blood pressure under control", "goal_gap"],
  ["what is his highest bp", "extreme:bp"],
  ["can he eat rice", "advice_limited"],
  ["what is his blood sugar", "untracked:blood_sugar"],
  ["tell me a joke", "out_of_scope"],
  // Hinglish / voice style
  ["aaj ka bp kitna hai papa ka", "value:bp"],
  ["pichle saat din ka bp average bata do", "average:bp"],
  ["papa ne kal kya khaya tha", "value:food"],
  ["aaj kitna chale papa", "value:steps"],
  ["raat ko papa kitne ghante soye the", "value:sleep"],
  ["dawai time pe li ya nahi kal", "adherence:medicine"],
  ["konsi dawai kab leni hai papa ko", "medicine_schedule"],
  ["papa ka wajan kitna ho gaya", "value:weight"],
  ["salt kitna kam karna chahiye", "advice_limited"],
  ["papa theek hain kya aaj", "daily_summary"],
  ["bp kaisa chal raha hai is hafte", "average:bp"],
  ["bhai papa ka sugar check kar do", "untracked:blood_sugar"],
  ["kal subah ka bp batao", "value:bp"],
  ["aaj shaam ka bp kya tha", "value:bp"],
  ["mera bp 150 by 95 hai", "typed_reading"],
];

const metricSet = (xs: string[]) => Array.from(new Set(xs.filter((m) => m !== "pulse"))).sort();

export function routingCases(): EvalCase[] {
  const cases: EvalCase[] = [];

  for (const r of ROUTES) {
    cases.push(
      caseOf("routing", `routing:${r.q}`, `"${r.q}" -> ${r.intent}`, (c) => {
        const ctx = fixture(r.arch ?? "steady");
        const out = answerWithRules({ message: r.q, ctx, ledger: buildLedger(ctx) });
        const en = out.answer.answer_en;
        c.ok(out.intent === r.intent || out.intent.startsWith(r.intent), `intent: expected ${r.intent}, got ${out.intent}`);
        if (r.metrics) c.eq(metricSet(out.answer.data_coverage.metrics.length ? out.answer.data_coverage.metrics : out.metrics), metricSet(r.metrics), "metrics the answer touched");
        for (const h of r.has ?? []) c.includes(en, typeof h === "function" ? h(ctx) : h, "answer_en");
        for (const n of r.not ?? []) c.excludes(en, n, "answer_en");
        if (r.needsDoctor !== undefined) c.eq(out.answer.needs_doctor, r.needsDoctor, "needs_doctor");
        c.ok(out.answer.answer_hi.length > 0 && out.answer.headline.length > 0 && out.answer.headline.length <= 160, "hi text and a headline within 160 chars");
      }),
    );
  }

  for (const [q, intent] of LANGUAGE_ROUTES) {
    cases.push(
      caseOf("routing: languages", `lang:${q}`, `"${q}" -> ${intent}`, (c) => {
        const ctx = fixture("steady");
        const out = answerWithRules({ message: q, ctx, ledger: buildLedger(ctx) });
        c.ok(out.intent === intent || out.intent.startsWith(intent), `intent: expected ${intent}, got ${out.intent}`);
      }),
    );
  }

  cases.push(
    caseOf("routing", "routing:echo", "a data answer says how the question was read", (c) => {
      const ctx = fixture("steady");
      const out = answerWithRules({ message: "pichle 7 din ka average BP kya tha", ctx, ledger: buildLedger(ctx) });
      c.includes(out.answer.answer_en, "I read the question as: BP", "understood echo (EN)");
      c.includes(out.answer.answer_hi, "मैंने सवाल ऐसे समझा", "understood echo (HI)");
    }),
    caseOf("routing", "routing:no-echo-off-topic", "small talk and out-of-scope answers carry no data suggestions", (c) => {
      const ctx = fixture("crisis");
      for (const q of ["hello", "aaj mausam kaisa hai", "sugar kitni hai"]) {
        const out = answerWithRules({ message: q, ctx, ledger: buildLedger(ctx) });
        c.eq(out.answer.recommendations.length, 0, `${q}: no data-driven recommendations on an unrelated question`);
      }
    }),
    caseOf("routing", "routing:allergy-from-notes", "an allergy question is answered from the family's saved notes, not from food logs", (c) => {
      const base = fixture("steady");
      const ctx: PatientContext = { ...base, memories: [{ id: "m1", kind: "allergy", content: "Papa ko doodh se allergy hai", createdAt: "2026-10-01T00:00:00.000Z" }] };
      const out = answerWithRules({ message: "doodh se allergy hai kya", ctx, ledger: buildLedger(ctx) });
      c.eq(out.intent, "saved_notes", "intent");
      c.includes(out.answer.answer_en, "Papa ko doodh se allergy hai", "quotes the saved note");
      c.excludes(out.answer.answer_en, "kcal", "no food log dump");
      const none = answerWithRules({ message: "peanut se allergy hai kya", ctx, ledger: buildLedger(ctx) });
      c.includes(none.answer.answer_en, "Nothing in the notes you saved covers this", "says so when no note matches");
    }),
    caseOf("routing", "routing:typed-reading-crisis", "a typed crisis reading still leads with the urgent notice", (c) => {
      const ctx = fixture("steady");
      const out = answerWithRules({ message: "BP 190/125 aa raha hai", ctx, ledger: buildLedger(ctx) });
      c.eq(out.intent, "typed_reading", "intent");
      c.includes(out.answer.answer_en, "190/125", "the typed values");
      c.includes(out.answer.answer_en, "Very high", "classified as crisis range");
    }),
    caseOf("routing", "routing:day-total-oracle", "a named-day food question still returns the exact day total (no regression from the new gates)", (c) => {
      const ctx = fixture("steady");
      const kcal = Math.round(ctx.food.filter((f) => f.date === "2026-10-03").reduce((a, b) => a + b.calories, 0));
      const out = answerWithRules({ message: "Kal Papa ne kya khaya?", ctx, ledger: buildLedger(ctx) });
      c.includes(out.answer.answer_en, `Day total ${kcal} kcal`, "day total");
    }),
    caseOf("routing", "routing:advice-detector", "advice detector: order-free, but not fooled by polite data requests or 'kya khana khaya'", (c) => {
      const yes = ["BP kam kaise karein", "kaise karein BP kam", "kela kha sakte hain", "can he eat rice", "kya khana chahiye", "exercise kitni karni chahiye", "BP high ho to kya karein", "salt kam karna chahiye kya"];
      const no = ["BP kitna hona chahiye", "kal papa ne kya khana khaya", "kya aap bata sakte hain BP kitna tha", "papa kaise hain", "aaj ka BP batao", "so what is the BP today"];
      for (const q of yes) c.ok(detectAdviceQuestion(q), `should be advice: ${q}`);
      for (const q of no) c.ok(!detectAdviceQuestion(q), `should NOT be advice: ${q}`);
    }),
    caseOf("routing", "routing:schedule-detector", "schedule detector: plan questions yes, 'was it taken / what is pending' no", (c) => {
      for (const q of ["dawai kab leni hai", "kaun si dawai khate hain", "kitne baje leni hai amlodipine", "medicine list batao"]) c.ok(detectScheduleQuestion(q), `should be schedule: ${q}`);
      for (const q of ["kal kitne baje dawai li", "aaj ki dawai kaunsi baaki hai", "dawai chhoot gayi kya", "kaun si dawai chhooti"]) c.ok(!detectScheduleQuestion(q), `should NOT be schedule: ${q}`);
    }),
    caseOf("routing", "routing:diagnosis-detector", "diagnosis detector: 'does he have X' yes; asking what to eat for X no", (c) => {
      for (const q of ["diabetes hai kya", "kya papa ko diabetes hai", "cancer to nahi hai", "kya ye stroke hai", "डायबिटीज़ है क्या", "do I have diabetes"]) c.ok(detectDiagnosisRequest(q), `should be diagnosis: ${q}`);
      for (const q of ["diabetes ke liye kya khana chahiye", "papa ko diabetes hai, BP kitna hai", "stroke se bachne ke liye kya karein", "BP kitna hai"]) c.ok(!detectDiagnosisRequest(q), `should NOT be diagnosis: ${q}`);
    }),
    caseOf("routing", "routing:empty-patient", "an empty patient: off-topic and untracked questions behave the same, data questions admit there is nothing", (c) => {
      const ctx = fixture("empty");
      const L = buildLedger(ctx);
      c.eq(answerWithRules({ message: "aaj mausam kaisa hai", ctx, ledger: L }).intent, "out_of_scope", "off-topic");
      c.eq(answerWithRules({ message: "sugar kitni hai", ctx, ledger: L }).intent, "untracked:blood_sugar", "untracked");
      c.includes(answerWithRules({ message: "sabse zyada BP kab tha", ctx, ledger: L }).answer.answer_en, "No BP data", "no BP -> says so");
      c.includes(answerWithRules({ message: "dawai kab leni hai", ctx, ledger: L }).answer.answer_en, "No medicines are recorded", "no medicines recorded");
    }),
  );

  return cases;
}

void T;
