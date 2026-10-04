/**
 * Answer verifier: the accuracy guarantee. PURE.
 *
 * An answer is accepted only if
 *   - its structure matches the contract (types, enums, lengths);
 *   - every `fact_ref` / `numbers[].ref` exists;
 *   - every source URL really appeared in a web_search result THIS turn;
 *   - every number in the prose is traceable: present in this turn's evidence
 *     (snapshot + tool results), present in the user's message, a documented
 *     rounding of such a number, a calendar window the data covers, a value the
 *     model declared in `numbers[]` that is arithmetically derivable from two
 *     evidence numbers, or a number inside a SOURCED guideline recommendation;
 *   - dates / clock times it mentions exist in the data or are derived from today;
 *   - it contains no dose/medicine instruction, definitive diagnosis, guarantee
 *     or cure claim, and no false reassurance when the ledger carries an alert.
 *
 * On failure the agent hands `formatViolations()` back to the model as an
 * `is_error` tool result so it can correct itself (max 2 repairs), after which
 * the deterministic engine takes over.
 */

import { fold, normalizeDigits } from "./normalize";
import { resolveTemporal } from "./temporal";
import {
  METRICS,
  RECOMMENDATION_BASES,
  RECOMMENDATION_KINDS,
  type AnswerDraft,
  type Confidence,
  type Recommendation,
  type SafetyLevel,
} from "./types";

export type ViolationCode =
  | "malformed"
  | "too_long"
  | "empty"
  | "unknown_ref"
  | "unverified_url"
  | "missing_source"
  | "unsupported_number"
  | "uncited_number"
  | "unsupported_date"
  | "unsupported_time"
  | "dose_instruction"
  | "definitive_diagnosis"
  | "guarantee"
  | "replace_doctor"
  | "false_reassurance"
  | "needs_doctor_missing";

export interface Violation {
  code: ViolationCode;
  /** Field path, e.g. "key_points[1].text". */
  where: string;
  message: string;
  value?: string;
}

export interface VerifyContext {
  userMessage: string;
  today: string;
  range: { from: string; to: string };
  /** Snapshot + every tool result text of this turn (everything the model saw). */
  evidenceTexts: string[];
  /** Always-allowed backing text (the snapshot minus the medicines line). */
  baseTexts: string[];
  /** The text a cited fact id / record ref / tool ref stands for; null when unknown. */
  refText: (ref: string) => string | null;
  /** Fact ids and record refs the data actually contains. */
  knownRefs: Set<string>;
  /** URLs that appeared in a web_search result this turn. */
  webUrls: Set<string>;
  medicineChangeRequest: boolean;
  diagnosisRequest: boolean;
  /** The ledger carries an attention/urgent flag: "nothing to worry" is not allowed. */
  hasAlertFlag: boolean;
}

export interface VerifyResult {
  ok: boolean;
  violations: Violation[];
  draft: AnswerDraft | null;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const LIMITS = {
  headline: 160,
  answer: 2800,
  keyPoints: 8,
  keyPointText: 420,
  numbers: 14,
  recommendations: 8,
  recommendationText: 520,
  sources: 8,
  followUps: 4,
  followUpText: 140,
  refusal: 500,
} as const;

const ALWAYS_ALLOWED = [112, 108];

// ---------------------------------------------------------------------------
// Number extraction
// ---------------------------------------------------------------------------

export interface NumTok {
  text: string;
  value: number;
  decimals: number;
  /** Up to 14 characters that follow the number (for unit detection). */
  tail?: string;
}

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, " ");
}

function stripListMarkers(text: string): string {
  return text.replace(/(^|\n)\s*(?:\d{1,2}[.)]|[-*•])\s+/g, "$1 ");
}

const NUM_RE = /([A-Za-z]?)(\d+(?:\.\d+)?)/g;

/** Plain numbers in `text` (already stripped of dates/times). Letter-prefixed digits (B12, SpO2) are skipped. */
export function numbersIn(text: string, keepLetterPrefixed = false): NumTok[] {
  // "10,000" and Indian grouping "1,50,000" -> one number.
  let t = text;
  for (let i = 0; i < 3; i++) t = t.replace(/(\d),(\d{2,3})(?!\d)/g, "$1$2");
  const out: NumTok[] = [];
  NUM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUM_RE.exec(t)) !== null) {
    if (m[1] && !keepLetterPrefixed) continue;
    const dec = m[2].split(".")[1];
    const endIdx = m.index + m[0].length;
    out.push({ text: m[2], value: Number(m[2]), decimals: dec ? dec.length : 0, tail: t.slice(endIdx, endIdx + 14) });
  }
  return out;
}

const ISO_RE = /\d{4}-\d{2}-\d{2}/g;
const TIME_RE = /(?:^|[^\d])(\d{1,2}):(\d{2})(?!\d)/g;

function minutesOfTimes(text: string): Set<number> {
  const out = new Set<number>();
  TIME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_RE.exec(text)) !== null) {
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h < 24 && mi < 60) out.add(h * 60 + mi);
  }
  return out;
}

export interface Evidence {
  numbers: NumTok[];
  exact: Set<string>;
  r0: Set<number>;
  r1: Set<number>;
  r2: Set<number>;
  sorted: number[];
  times: Set<number>;
  dates: Set<string>;
  lowerText: string;
}

function roundTo(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export function buildEvidence(texts: string[], extraNumbers: number[] = []): Evidence {
  const nums: NumTok[] = [];
  const times = new Set<number>();
  const dates = new Set<string>();
  let lower = "";
  for (const raw of texts) {
    const t = normalizeDigits(stripUrls(raw));
    lower += `${t.toLowerCase()}\n`;
    (t.match(ISO_RE) ?? []).forEach((d) => dates.add(d));
    minutesOfTimes(t).forEach((x) => times.add(x));
    const stripped = t.replace(ISO_RE, " ").replace(/\d{1,2}:\d{2}/g, " ");
    nums.push(...numbersIn(stripped, true));
  }
  for (const v of [...ALWAYS_ALLOWED, ...extraNumbers]) nums.push({ text: String(v), value: v, decimals: 0 });
  const exact = new Set<string>();
  const r0 = new Set<number>();
  const r1 = new Set<number>();
  const r2 = new Set<number>();
  const uniq = new Set<number>();
  for (const n of nums) {
    exact.add(String(n.value));
    r0.add(Math.round(n.value));
    r1.add(roundTo(n.value, 1));
    r2.add(roundTo(n.value, 2));
    uniq.add(n.value);
  }
  return { numbers: nums, exact, r0, r1, r2, sorted: Array.from(uniq).sort((a, b) => a - b), times, dates, lowerText: lower };
}

/** Is `x` an evidence number, or its documented rounding (0, 1 or 2 decimals)? */
export function inEvidence(x: NumTok, ev: Evidence): boolean {
  if (ev.exact.has(String(x.value))) return true;
  if (x.decimals === 0) return ev.r0.has(x.value);
  if (x.decimals === 1) return ev.r1.has(roundTo(x.value, 1));
  if (x.decimals === 2) return ev.r2.has(roundTo(x.value, 2));
  return false;
}

function hasNear(sorted: number[], target: number, tol: number): boolean {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (Math.abs(sorted[mid] - target) <= tol) return true;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

/** x = a + b, |a - b|, a/b, a/b*100 or (a-b)/b*100 for evidence numbers a, b (within rounding). */
export function isDerivable(x: NumTok, ev: Evidence): boolean {
  const tol = 0.5 * 10 ** -x.decimals + 1e-9;
  const U = ev.sorted;
  for (const a of U) {
    if (hasNear(U, x.value - a, tol)) return true; // a + b
    if (hasNear(U, a - x.value, tol)) return true; // a - b
  }
  if (U.length <= 2500) {
    for (const a of U) {
      for (const b of U) {
        if (b === 0) continue;
        const ratio = a / b;
        if (Math.abs(ratio - x.value) <= tol) return true;
        if (Math.abs(ratio * 100 - x.value) <= tol) return true;
        if (Math.abs((ratio - 1) * 100 - x.value) <= tol) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u.trim());
    url.hash = "";
    let s = `${url.protocol}//${url.host.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`;
    s = s.replace(/\/$/, "");
    return s;
  } catch {
    return u.trim().toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// Forbidden patterns
// ---------------------------------------------------------------------------

interface Forbidden {
  code: ViolationCode;
  re: RegExp;
  /** A match is excused when one of these appears within 40 chars before/after. */
  guard: RegExp | null;
  message: string;
}

const GUARD =
  /\b(?:not|never|don'?t|do not|dont|without|avoid|unless|before)\b|नहीं|मत|कभी|बिना|\b(?:nahi|nahin|mat|bina|kabhi)\b|ask (?:your |the )?doctor|doctor se (?:puch|pooch|baat)|डॉक्टर से (?:पूछ|पूछे|पूछें|बात)/i;

const FORBIDDEN: Forbidden[] = [
  {
    code: "dose_instruction",
    re: /\b(?:increase|decrease|reduce|double|halve|raise|lower|adjust|change|skip|stop|discontinue|quit|start|begin|restart|switch)\s+(?:the\s+|your\s+|his\s+|her\s+|papa'?s\s+|a\s+)?(?:dose|dosage|medicine|medication|tablet|pill|insulin)s?\b/i,
    guard: GUARD,
    message: "Do not tell the family to start, stop, skip or change a medicine or dose. Explain, show adherence data, and say to ask the doctor.",
  },
  {
    code: "dose_instruction",
    re: /(?:दवा|दवाई|गोली|खुराक|डोज़?|डोज|इंसुलिन)\s*(?:को\s*)?(?:बंद|रोक|बढ़ा|घटा|कम|ज़्यादा|ज्यादा|छोड़|बदल|शुरू|दोगुना)/,
    guard: GUARD,
    message: "Do not tell the family to start, stop, skip or change a medicine or dose. Explain and refer to the doctor.",
  },
  {
    code: "dose_instruction",
    re: /\b(?:dawai|dawa|davai|goli|dose|khurak)\s+(?:band|rok|badha|kam|chhod|badal|shuru|double)\b/i,
    guard: GUARD,
    message: "Do not tell the family to start, stop, skip or change a medicine or dose. Explain and refer to the doctor.",
  },
  {
    code: "definitive_diagnosis",
    re: /\b(?:you|he|she|papa|the patient)\s+(?:definitely|certainly|surely|clearly)\s+(?:have|has|had|is suffering)\b|\b(?:you|he|she)\s+(?:have|has|are having|is having|suffers? from|are suffering from)\s+(?:a\s+|an\s+)?(?:stroke|heart attack|diabetes|cancer|kidney failure|infection|thyroid)\b/i,
    guard: null,
    message: "Do not give a definitive diagnosis. Describe what the data shows and say a doctor must diagnose.",
  },
  {
    code: "definitive_diagnosis",
    re: /(?:पक्का|निश्चित रूप से|ज़रूर|जरूर)[^.\n]{0,30}(?:स्ट्रोक|डायबिटीज़|डायबिटीज|कैंसर|हार्ट अटैक|संक्रमण|किडनी|थायराइड)|(?:पापा|मरीज़|मरीज|उन्हें)\s*को\s*(?:स्ट्रोक|डायबिटीज़|डायबिटीज|कैंसर|हार्ट अटैक)\s*है/,
    guard: null,
    message: "Do not give a definitive diagnosis. Describe what the data shows and say a doctor must diagnose.",
  },
  {
    code: "guarantee",
    re: /\bguarantee[ds]?\b|\bcures?\b|\bcured\b|\bmiracle\b|100\s*%\s*(?:safe|sure|cure|effective)|\bwill\s+definitely\s+(?:fix|reverse|heal)\b|गारंटी|पक्का\s+ठीक|जड़\s+से\s+(?:खत्म|ख़त्म)|चमत्कार|\bpakka\s+theek\b|\bgarantee\b/i,
    guard: /\b(?:no|not|cannot|can'?t|nahi|नहीं)\b/i,
    message: "Never promise outcomes or claim a cure. Use cautious, evidence-based wording.",
  },
  {
    code: "replace_doctor",
    re: /\b(?:no need|don'?t need|do not need|not necessary|unnecessary)\s+(?:to\s+)?(?:see|consult|visit|call|ask)\s+(?:a\s+|the\s+|your\s+)?doctor|डॉक्टर\s*(?:को\s*दिखाने\s*)?की\s*(?:कोई\s*)?ज़रूरत\s*नहीं|doctor\s+ki\s+(?:koi\s+)?zarurat\s+nahi/i,
    guard: null,
    message: "Never say a doctor is unnecessary.",
  },
];

const REASSURANCE =
  /\b(?:nothing to worry|no need to worry|don'?t worry|no cause for concern|all is well|everything is fine)\b|चिंता की कोई बात नहीं|घबराने की (?:कोई )?ज़रूरत नहीं|\bchinta ki koi baat nahi\b|सब ठीक है/i;

function scanForbidden(text: string, where: string, out: Violation[]) {
  for (const f of FORBIDDEN) {
    const re = new RegExp(f.re.source, f.re.flags.includes("g") ? f.re.flags : `${f.re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
      if (f.guard && (f.guard.test(before) || f.guard.test(after))) continue;
      out.push({ code: f.code, where, message: f.message, value: m[0] });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Structural validation
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function strArr(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
}

/** Validate the raw `submit_answer` input into an AnswerDraft. Never throws. */
export function coerceDraft(input: unknown): { draft: AnswerDraft | null; violations: Violation[] } {
  const v: Violation[] = [];
  const bad = (where: string, message: string) => v.push({ code: "malformed", where, message });
  if (!isObj(input)) return { draft: null, violations: [{ code: "malformed", where: "$", message: "Answer must be a JSON object." }] };

  const headline = str(input.headline);
  const answer_hi = str(input.answer_hi);
  const answer_en = str(input.answer_en);
  if (headline === null) bad("headline", "headline must be a string");
  if (answer_hi === null) bad("answer_hi", "answer_hi must be a string");
  if (answer_en === null) bad("answer_en", "answer_en must be a string");

  const key_points: AnswerDraft["key_points"] = [];
  if (!Array.isArray(input.key_points)) bad("key_points", "key_points must be an array");
  else
    input.key_points.forEach((k, i) => {
      if (!isObj(k) || str(k.text) === null || strArr(k.fact_refs) === null) bad(`key_points[${i}]`, "needs {text: string, fact_refs: string[]}");
      else key_points.push({ text: k.text as string, fact_refs: k.fact_refs as string[] });
    });

  const numbers: AnswerDraft["numbers"] = [];
  if (!Array.isArray(input.numbers)) bad("numbers", "numbers must be an array");
  else
    input.numbers.forEach((n, i) => {
      if (!isObj(n) || str(n.label) === null || typeof n.value !== "number" || !Number.isFinite(n.value) || str(n.unit) === null || str(n.ref) === null)
        bad(`numbers[${i}]`, "needs {label: string, value: number, unit: string, ref: string}");
      else numbers.push({ label: n.label as string, value: n.value as number, unit: n.unit as string, ref: n.ref as string });
    });

  const recommendations: Recommendation[] = [];
  if (!Array.isArray(input.recommendations)) bad("recommendations", "recommendations must be an array");
  else
    input.recommendations.forEach((r, i) => {
      if (
        !isObj(r) ||
        str(r.text) === null ||
        !RECOMMENDATION_KINDS.includes(r.kind as never) ||
        !RECOMMENDATION_BASES.includes(r.basis as never) ||
        strArr(r.source_urls) === null
      )
        bad(`recommendations[${i}]`, `needs {text, kind: ${RECOMMENDATION_KINDS.join("|")}, basis: ${RECOMMENDATION_BASES.join("|")}, source_urls: string[]}`);
      else recommendations.push({ text: r.text as string, kind: r.kind as Recommendation["kind"], basis: r.basis as Recommendation["basis"], source_urls: r.source_urls as string[] });
    });

  const sources: AnswerDraft["sources"] = [];
  if (!Array.isArray(input.sources)) bad("sources", "sources must be an array");
  else
    input.sources.forEach((s, i) => {
      if (!isObj(s) || str(s.title) === null || str(s.url) === null || str(s.publisher) === null) bad(`sources[${i}]`, "needs {title, url, publisher}");
      else sources.push({ title: s.title as string, url: s.url as string, publisher: s.publisher as string });
    });

  const confidence = input.confidence;
  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") bad("confidence", "confidence must be high|medium|low");
  const safety_level = input.safety_level;
  if (safety_level !== "info" && safety_level !== "attention" && safety_level !== "escalate") bad("safety_level", "safety_level must be info|attention|escalate");
  if (typeof input.needs_doctor !== "boolean") bad("needs_doctor", "needs_doctor must be a boolean");

  let coverage: AnswerDraft["data_coverage"] | null = null;
  const dc = input.data_coverage;
  if (
    !isObj(dc) ||
    strArr(dc.metrics) === null ||
    !isObj(dc.range) ||
    str(dc.range.from) === null ||
    str(dc.range.to) === null ||
    typeof dc.n !== "number" ||
    !Number.isFinite(dc.n)
  ) {
    bad("data_coverage", "needs {metrics: string[], range: {from, to}, n: number}");
  } else {
    const range = dc.range as Record<string, unknown>;
    coverage = {
      metrics: (dc.metrics as string[]).filter((m) => (METRICS as readonly string[]).includes(m)),
      range: { from: range.from as string, to: range.to as string },
      n: Math.max(0, Math.round(dc.n)),
    };
  }

  const follow = strArr(input.follow_up_questions);
  if (follow === null) bad("follow_up_questions", "follow_up_questions must be a string array");
  const refusal = input.refusal === undefined || input.refusal === null ? "" : str(input.refusal);
  if (refusal === null) bad("refusal", "refusal must be a string (empty when not refusing)");

  if (v.length > 0 || headline === null || answer_hi === null || answer_en === null || !coverage || follow === null || refusal === null) {
    return { draft: null, violations: v };
  }
  return {
    draft: {
      headline,
      answer_hi,
      answer_en,
      key_points,
      numbers,
      recommendations,
      sources,
      confidence: confidence as Confidence,
      data_coverage: coverage,
      needs_doctor: input.needs_doctor as boolean,
      safety_level: safety_level as SafetyLevel,
      follow_up_questions: follow,
      refusal,
    },
    violations: [],
  };
}

// ---------------------------------------------------------------------------
// Prose checks
// ---------------------------------------------------------------------------

const ADVICE_UNITS: Array<{ re: RegExp; max: number }> = [
  { re: /^\s*(?:मिनट|minutes?|mins?|min)(?![\w\u0900-\u097F])/i, max: 90 },
  { re: /^\s*(?:गिलास|glass(?:es)?)(?![\w\u0900-\u097F])/i, max: 12 },
  { re: /^\s*(?:बार|times?)(?![\w\u0900-\u097F])/i, max: 10 },
  { re: /^\s*(?:घंटे|घण्टे|hours?|hrs?)(?![\w\u0900-\u097F])/i, max: 12 },
  { re: /^\s*(?:दिन|days?|हफ्ते|हफ़्ते|weeks?|सप्ताह)(?![\w\u0900-\u097F])/i, max: 14 },
  { re: /^\s*(?:चम्मच|spoons?|tsp|कटोरी|bowls?)(?![\w\u0900-\u097F])/i, max: 4 },
];

interface ProseCheckInput {
  text: string;
  where: string;
  /** Evidence backed by what the answer CITES (+ the snapshot base). */
  ev: Evidence;
  /** Everything the model saw this turn; a number only here is "uncited". */
  globalEv: Evidence;
  userNums: Set<string>;
  declared: Evidence | null;
  guidelineNums: Evidence | null;
  ctx: VerifyContext;
  mode: "strict" | "advice";
  out: Violation[];
}

function checkProse(p: ProseCheckInput) {
  const { ctx, out, where, ev, globalEv } = p;
  const raw = stripUrls(stripListMarkers(p.text));

  // 1. Calendar expressions: validated against the loaded range, then blanked.
  const temporal = resolveTemporal(raw, ctx.today);
  for (const s of temporal.spans) {
    if (s.to > ctx.today || s.from < ctx.range.from) {
      const inUser = fold(ctx.userMessage).includes(fold(s.matched));
      if (!inUser) {
        out.push({
          code: "unsupported_date",
          where,
          message: `"${s.matched}" refers to ${s.from === s.to ? s.from : `${s.from}..${s.to}`}, outside the loaded data (${ctx.range.from}..${ctx.today}).`,
          value: s.matched,
        });
      }
    }
  }
  for (const bad of temporal.invalid) {
    out.push({ code: "unsupported_date", where, message: `"${bad}" is not a real calendar date.`, value: bad });
  }

  // 2. Clock times: must exist in the evidence (or the user's message).
  const rest = normalizeDigits(temporal.remainder);
  const userTimes = minutesOfTimes(normalizeDigits(ctx.userMessage));
  TIME_RE.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = TIME_RE.exec(rest)) !== null) {
    const h = Number(tm[1]);
    const mi = Number(tm[2]);
    if (h > 23 || mi > 59) continue;
    const mins = h * 60 + mi;
    if (!globalEv.times.has(mins) && !userTimes.has(mins)) {
      out.push({ code: "unsupported_time", where, message: `Time ${tm[1]}:${tm[2]} does not appear in the data you were given.`, value: `${tm[1]}:${tm[2]}` });
    }
  }
  const noTimes = rest.replace(/\d{1,2}:\d{2}/g, " ");

  // 3. Everything else numeric.
  for (const tok of numbersIn(noTimes)) {
    if (p.userNums.has(String(tok.value))) continue;
    if (inEvidence(tok, ev)) continue;
    if (p.declared && inEvidence(tok, p.declared)) continue;
    if (p.guidelineNums && inEvidence(tok, p.guidelineNums)) continue;
    // calendar year
    if (Number.isInteger(tok.value) && Math.abs(tok.value - Number(ctx.today.slice(0, 4))) <= 1) continue;
    if (p.mode === "advice") {
      // General lifestyle quantities ("20 minute walk", "2 glass paani") are advice, not patient facts.
      const unit = ADVICE_UNITS.find((u) => u.re.test(tok.tail ?? ""));
      if (unit && tok.value <= unit.max) continue;
    }
    if (inEvidence(tok, globalEv)) {
      out.push({
        code: "uncited_number",
        where,
        message: `The number ${tok.text} exists in the data but is not backed by anything you cite. Add the fact id, record ref or tool ref it came from to fact_refs (or numbers[].ref), or remove it.`,
        value: tok.text,
      });
    } else {
      out.push({
        code: "unsupported_number",
        where,
        message: `The number ${tok.text} is not in the data or tool results you were given. Use an exact value from a tool result, or remove the number.`,
        value: tok.text,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function verifyAnswer(input: unknown, ctx: VerifyContext): VerifyResult {
  const { draft, violations } = coerceDraft(input);
  if (!draft) return { ok: false, violations, draft: null };
  const out: Violation[] = [...violations];

  // --- limits & emptiness --------------------------------------------------
  const lim = (where: string, s: string, max: number) => {
    if (s.trim().length === 0) out.push({ code: "empty", where, message: `${where} must not be empty.` });
    if (s.length > max) out.push({ code: "too_long", where, message: `${where} is ${s.length} characters; maximum is ${max}.` });
  };
  lim("headline", draft.headline, LIMITS.headline);
  lim("answer_hi", draft.answer_hi, LIMITS.answer);
  lim("answer_en", draft.answer_en, LIMITS.answer);
  if (draft.key_points.length > LIMITS.keyPoints) out.push({ code: "too_long", where: "key_points", message: `At most ${LIMITS.keyPoints} key points.` });
  draft.key_points.forEach((k, i) => lim(`key_points[${i}].text`, k.text, LIMITS.keyPointText));
  if (draft.numbers.length > LIMITS.numbers) out.push({ code: "too_long", where: "numbers", message: `At most ${LIMITS.numbers} numbers.` });
  if (draft.recommendations.length > LIMITS.recommendations) out.push({ code: "too_long", where: "recommendations", message: `At most ${LIMITS.recommendations} recommendations.` });
  draft.recommendations.forEach((r, i) => lim(`recommendations[${i}].text`, r.text, LIMITS.recommendationText));
  if (draft.sources.length > LIMITS.sources) out.push({ code: "too_long", where: "sources", message: `At most ${LIMITS.sources} sources.` });
  if (draft.follow_up_questions.length > LIMITS.followUps) out.push({ code: "too_long", where: "follow_up_questions", message: `At most ${LIMITS.followUps} follow-up questions.` });
  draft.follow_up_questions.forEach((q, i) => lim(`follow_up_questions[${i}]`, q, LIMITS.followUpText));
  if (draft.refusal.length > LIMITS.refusal) out.push({ code: "too_long", where: "refusal", message: `refusal is too long.` });

  // --- data coverage -------------------------------------------------------
  const { from, to } = draft.data_coverage.range;
  const dateOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  if (!dateOk(from) || !dateOk(to) || from > to) out.push({ code: "malformed", where: "data_coverage.range", message: "range must be valid YYYY-MM-DD dates with from <= to." });
  else if (from < ctx.range.from || to > ctx.today) out.push({ code: "unsupported_date", where: "data_coverage.range", message: `range must lie within the loaded data ${ctx.range.from}..${ctx.today}.` });

  // --- refs ----------------------------------------------------------------
  draft.key_points.forEach((k, i) =>
    k.fact_refs.forEach((r) => {
      if (!ctx.knownRefs.has(r)) out.push({ code: "unknown_ref", where: `key_points[${i}].fact_refs`, message: `"${r}" is not a fact id or record ref from the data. Use ids exactly as shown.`, value: r });
    }),
  );
  draft.numbers.forEach((n, i) => {
    if (!ctx.knownRefs.has(n.ref)) out.push({ code: "unknown_ref", where: `numbers[${i}].ref`, message: `"${n.ref}" is not a fact id or record ref from the data.`, value: n.ref });
  });

  // --- URLs ----------------------------------------------------------------
  const webSet = new Set(Array.from(ctx.webUrls).map(normalizeUrl));
  const urlOk = (u: string) => webSet.has(normalizeUrl(u));
  draft.sources.forEach((s, i) => {
    if (!urlOk(s.url)) out.push({ code: "unverified_url", where: `sources[${i}].url`, message: `${s.url} did not appear in a web search result this turn. Only cite URLs returned by web_search.`, value: s.url });
    if (s.title.trim() === "" || s.publisher.trim() === "") out.push({ code: "malformed", where: `sources[${i}]`, message: "title and publisher must not be empty." });
  });
  draft.recommendations.forEach((r, i) => {
    r.source_urls.forEach((u) => {
      if (!urlOk(u)) out.push({ code: "unverified_url", where: `recommendations[${i}].source_urls`, message: `${u} did not appear in a web search result this turn.`, value: u });
    });
    if (r.basis === "guideline" && r.source_urls.length === 0) {
      out.push({ code: "missing_source", where: `recommendations[${i}]`, message: 'basis "guideline" needs at least one source URL from web_search; otherwise use basis "general" and avoid specific numbers.' });
    }
    if (r.basis === "guideline") {
      r.source_urls.forEach((u) => {
        if (!draft.sources.some((s) => normalizeUrl(s.url) === normalizeUrl(u))) {
          out.push({ code: "missing_source", where: `recommendations[${i}].source_urls`, message: `${u} must also be listed in sources[] with title and publisher.`, value: u });
        }
      });
    }
  });

  // --- numbers -------------------------------------------------------------
  // Two evidence sets: what the answer CITES (strict) and everything the model saw (to tell
  // "invented" from "real but uncited").
  const citedRefs = [...draft.key_points.flatMap((k) => k.fact_refs), ...draft.numbers.map((n) => n.ref)];
  const citedTexts = Array.from(new Set(citedRefs)).map((r) => ctx.refText(r)).filter((t): t is string => t !== null);
  const ev = buildEvidence([...ctx.baseTexts, ...citedTexts]);
  const globalEv = buildEvidence(ctx.evidenceTexts);
  const userNorm = normalizeDigits(ctx.userMessage);
  const userNums = new Set(numbersIn(userNorm.replace(ISO_RE, " ").replace(/\d{1,2}:\d{2}/g, " "), true).map((n) => String(n.value)));

  // Declared numbers: must themselves be traceable or derivable from what is cited.
  draft.numbers.forEach((n, i) => {
    const decimals = (String(n.value).split(".")[1] ?? "").length;
    const tok: NumTok = { text: String(n.value), value: n.value, decimals };
    if (userNums.has(String(n.value)) || inEvidence(tok, ev) || isDerivable(tok, ev)) return;
    const real = inEvidence(tok, globalEv);
    out.push({
      code: real ? "uncited_number" : "unsupported_number",
      where: `numbers[${i}].value`,
      message: real
        ? `${n.value} (${n.label}) exists in the data but ${n.ref} does not contain it. Use the ref it really came from.`
        : `${n.value} (${n.label}) is neither in the tool results nor derivable (sum, difference, ratio, percentage) from the facts you cite. Copy the value from a tool result.`,
      value: String(n.value),
    });
  });
  const declaredEv = buildEvidence(
    [],
    draft.numbers.map((n) => n.value),
  );
  // Numbers from sourced guideline recommendations may be repeated in prose.
  const guidelineTexts = draft.recommendations.filter((r) => r.basis === "guideline" && r.source_urls.length > 0).map((r) => r.text);
  const guidelineEv = guidelineTexts.length ? buildEvidence(guidelineTexts) : null;

  const proseBase = { ev, globalEv, userNums, declared: declaredEv, ctx, out } as const;
  checkProse({ ...proseBase, text: draft.headline, where: "headline", guidelineNums: guidelineEv, mode: "strict" });
  checkProse({ ...proseBase, text: draft.answer_hi, where: "answer_hi", guidelineNums: guidelineEv, mode: "strict" });
  checkProse({ ...proseBase, text: draft.answer_en, where: "answer_en", guidelineNums: guidelineEv, mode: "strict" });
  draft.key_points.forEach((k, i) => checkProse({ ...proseBase, text: k.text, where: `key_points[${i}].text`, guidelineNums: guidelineEv, mode: "strict" }));
  draft.follow_up_questions.forEach((q, i) => checkProse({ ...proseBase, text: q, where: `follow_up_questions[${i}]`, guidelineNums: null, mode: "strict" }));
  draft.recommendations.forEach((r, i) => {
    const where = `recommendations[${i}].text`;
    if (r.basis === "patient_data") checkProse({ ...proseBase, text: r.text, where, guidelineNums: null, mode: "strict" });
    else if (r.basis === "guideline" && r.source_urls.length > 0) {
      // Guideline figures cannot be checked by code; they are allowed here only because a verified source is attached.
      checkProse({ ...proseBase, text: r.text, where, guidelineNums: buildEvidence([r.text]), mode: "advice" });
    } else checkProse({ ...proseBase, text: r.text, where, guidelineNums: null, mode: "advice" });
  });

  // --- forbidden patterns --------------------------------------------------
  const texts: Array<[string, string]> = [
    ["headline", draft.headline],
    ["answer_hi", draft.answer_hi],
    ["answer_en", draft.answer_en],
    ...draft.key_points.map((k, i): [string, string] => [`key_points[${i}].text`, k.text]),
    ...draft.recommendations.map((r, i): [string, string] => [`recommendations[${i}].text`, r.text]),
  ];
  for (const [where, text] of texts) {
    scanForbidden(text, where, out);
    // "10 mg" style dose figures are allowed only when they are the patient's recorded dose.
    const dose = /\b(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ml|iu)\b/gi;
    let dm: RegExpExecArray | null;
    while ((dm = dose.exec(text)) !== null) {
      const token = `${dm[1]} ${dm[2]}`.toLowerCase();
      const compact = `${dm[1]}${dm[2]}`.toLowerCase();
      if (!globalEv.lowerText.includes(token) && !globalEv.lowerText.includes(compact)) {
        out.push({ code: "dose_instruction", where, message: "Do not state medicine doses that are not the patient's recorded doses.", value: dm[0] });
      }
    }
    if (ctx.hasAlertFlag || draft.safety_level !== "info" || draft.needs_doctor) {
      REASSURANCE.lastIndex = 0;
      const rm = REASSURANCE.exec(text);
      if (rm) out.push({ code: "false_reassurance", where, message: "Do not reassure ('nothing to worry') when the data carries an alert or a doctor visit is advised.", value: rm[0] });
    }
  }

  // --- safety conditions ---------------------------------------------------
  if (ctx.medicineChangeRequest || ctx.diagnosisRequest) {
    if (!draft.needs_doctor || !draft.recommendations.some((r) => r.kind === "ask_doctor")) {
      out.push({
        code: "needs_doctor_missing",
        where: "needs_doctor",
        message: "The question asks for a medicine change or a diagnosis: set needs_doctor=true and include an ask_doctor recommendation (what to ask, and which data to show).",
      });
    }
  }

  return { ok: out.length === 0, violations: dedupe(out), draft };
}

function dedupe(vs: Violation[]): Violation[] {
  const seen = new Set<string>();
  return vs.filter((v) => {
    const k = `${v.code}|${v.where}|${v.value ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The exact text the model receives as an error tool_result. */
export function formatViolations(vs: Violation[]): string {
  const lines = vs.slice(0, 20).map((v, i) => `${i + 1}. [${v.code}] ${v.where}: ${v.message}${v.value ? ` (offending: ${JSON.stringify(v.value)})` : ""}`);
  return `Your answer was NOT accepted. Fix every item below and call submit_answer again with the corrected full answer. Do not add new numbers that you did not read from a tool result.\n${lines.join("\n")}`;
}
