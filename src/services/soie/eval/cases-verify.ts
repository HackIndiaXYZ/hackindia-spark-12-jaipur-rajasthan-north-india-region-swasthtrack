/**
 * Evaluation cases for the verifier (verify.ts), the accuracy guarantee.
 * Fabricated numbers, dates, refs and URLs MUST be rejected; faithful answers
 * (including documented rounding and derived values) MUST pass.
 */

import { buildLedger } from "../ledger";
import { knownRefs, refEvidenceText } from "../evidence";
import { buildSnapshot, snapshotBase } from "../prompt";
import { assessSafety } from "../safety";
import { executeTool } from "../tools";
import type { AnswerDraft, Ledger, PatientContext } from "../types";
import { verifyAnswer, type VerifyContext, type VerifyResult } from "../verify";
import { caseOf, type EvalCase } from "./harness";
import { FIXTURE_NOW, FIXTURE_TODAY, fixture, type ArchetypeId } from "./fixtures";

const T = FIXTURE_TODAY;

export interface VerifyEnv {
  ctx: PatientContext;
  ledger: Ledger;
  vctx: VerifyContext;
}

const noDeps = { saveMemory: async () => ({ id: "m" }) };

export async function verifyEnv(arch: ArchetypeId, message = "pichle 7 din ka BP kaisa raha", over: Partial<VerifyContext> = {}): Promise<VerifyEnv> {
  const ctx = fixture(arch);
  const ledger = buildLedger(ctx, FIXTURE_NOW);
  const safety = assessSafety(message, { latestBP: ctx.bp[ctx.bp.length - 1] ?? null, thresholds: ctx.goals.bp, now: FIXTURE_NOW });
  const overview = await executeTool("get_overview", { detail: "full" }, { ctx, ledger, canWrite: false, allowSave: false, deps: noDeps });
  const snapshot = buildSnapshot(ctx, ledger, safety);
  const vctx: VerifyContext = {
    userMessage: safety.sanitized,
    today: ctx.today,
    range: { from: ctx.range.from, to: ctx.today },
    evidenceTexts: [snapshot, overview.content],
    baseTexts: [snapshotBase(snapshot)],
    refText: (r) => refEvidenceText(r, ctx, ledger),
    knownRefs: knownRefs(ctx, ledger),
    webUrls: new Set<string>(),
    medicineChangeRequest: safety.medicineChangeRequest,
    diagnosisRequest: safety.diagnosisRequest,
    hasAlertFlag: ledger.flags.some((f) => f.severity !== "info"),
    ...over,
  };
  return { ctx, ledger, vctx };
}

/** A faithful draft built from real ledger values. */
export function goodDraft(env: VerifyEnv, over: Partial<AnswerDraft> = {}): AnswerDraft {
  const L = env.ledger.byId;
  const sys = L["bp.7d.mean_sys"].value as number;
  const dia = L["bp.7d.mean_dia"].value as number;
  const n = L["bp.7d.n"].value as number;
  return {
    headline: `पिछले 7 दिन का औसत BP ${sys}/${dia}`,
    answer_hi: `पिछले 7 दिन में ${n} रीडिंग का औसत BP ${sys}/${dia} mmHg रहा।`,
    answer_en: `Over the last 7 days the mean BP across ${n} readings was ${sys}/${dia} mmHg.`,
    key_points: [{ text: `औसत ${sys}/${dia} (${n} रीडिंग)`, fact_refs: ["bp.7d.mean_sys", "bp.7d.mean_dia"] }],
    numbers: [{ label: "औसत सिस्टोलिक", value: sys, unit: "mmHg", ref: "bp.7d.mean_sys" }],
    recommendations: [{ text: "रोज़ सुबह-शाम BP नापकर दर्ज करते रहें।", kind: "monitoring", basis: "patient_data", source_urls: [] }],
    sources: [],
    confidence: "high",
    data_coverage: { metrics: ["bp"], range: { from: "2026-09-28", to: T }, n },
    needs_doctor: false,
    safety_level: "info",
    follow_up_questions: ["पिछले 30 दिन का BP कैसा रहा?"],
    refusal: "",
    ...over,
  };
}

const run = (env: VerifyEnv, draft: unknown, over: Partial<VerifyContext> = {}): VerifyResult => verifyAnswer(draft, { ...env.vctx, ...over });
const isNum = (v: { code: string }) => v.code === "unsupported_number" || v.code === "uncited_number";
const codes = (r: VerifyResult) => r.violations.map((v) => `${v.code}@${v.where}`).join(", ");

export function verifyCases(): EvalCase[] {
  const out: EvalCase[] = [];
  const G = "verifier";

  out.push(
    caseOf(G, "verify:good", "a faithful answer built from ledger values passes", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env));
      c.ok(r.ok, `should pass, got: ${codes(r)}`);
    }),
    caseOf(G, "verify:fabricated-mean", "FABRICATED mean BP in the prose is rejected", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { answer_en: "Over the last 7 days the mean BP was 151.3/97.4 mmHg." }));
      c.ok(!r.ok && r.violations.some((v) => v.code === "unsupported_number" && v.value === "151.3"), `151.3 must be flagged as unsupported, got: ${codes(r)}`);
    }),
    caseOf(G, "verify:fabricated-count", "FABRICATED reading count is rejected", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { answer_hi: "पिछले 7 दिन में 41 रीडिंग दर्ज हैं।" }));
      c.ok(r.violations.some((v) => isNum(v) && v.value === "41"), `41 must be flagged, got: ${codes(r)}`);
    }),
    caseOf(G, "verify:fabricated-in-keypoint", "a fabricated number inside a key point is rejected", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { key_points: [{ text: "सबसे ऊँची रीडिंग 199/130 थी", fact_refs: ["bp.7d.max"] }] }));
      c.ok(r.violations.some((v) => v.where.startsWith("key_points[0]") && isNum(v)), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:fabricated-in-patient-rec", "a fabricated number in a patient_data recommendation is rejected", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { recommendations: [{ text: "आपका औसत सोडियम 3333 mg है, इसे घटाएँ।", kind: "diet", basis: "patient_data", source_urls: [] }] }));
      c.ok(r.violations.some((v) => isNum(v) && v.value === "3333"), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:rounding-allowed", "documented rounding (0 decimals) of an evidence number is accepted; a wrong 1-decimal value is not", async (c) => {
      const env = await verifyEnv("steady");
      const sys = env.ledger.byId["bp.7d.mean_sys"].value as number;
      const okR = run(env, goodDraft(env, { answer_en: `The mean systolic BP was about ${Math.round(sys)} mmHg.` }));
      c.ok(okR.ok, `rounded value should pass, got: ${codes(okR)}`);
      const bad = run(env, goodDraft(env, { answer_en: `The mean systolic BP was ${Math.round((sys + 0.7) * 10) / 10} mmHg.` }));
      c.ok(bad.violations.some(isNum), "shifted decimal must be rejected");
    }),
    caseOf(G, "verify:user-number", "a number the user typed may be repeated", async (c) => {
      const env = await verifyEnv("steady", "kya 137 ka BP theek hai");
      const r = run(env, goodDraft(env, { answer_en: "A reading of 137 is above the 130 target." }));
      c.ok(!r.violations.some((v) => v.value === "137"), `137 should be allowed, got: ${codes(r)}`);
    }),
    caseOf(G, "verify:uncited-number", "a REAL number that no cited fact backs is rejected as uncited (cite what you use)", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { key_points: [{ text: "औसत BP ठीक है", fact_refs: [] }], numbers: [] }));
      c.ok(r.violations.some((v) => v.code === "uncited_number"), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:tool-ref-backs-numbers", "a tool:N tag backs the numbers in that tool result", async (c) => {
      const env = await verifyEnv("steady");
      const text = '{"stats":{"meanSys":131.4,"n":12}}';
      const known = new Set(env.vctx.knownRefs);
      known.add("tool:1");
      const draft = goodDraft(env, { headline: "औसत BP 131.4", answer_hi: "औसत सिस्टोलिक 131.4 mmHg (12 रीडिंग)।", answer_en: "Mean systolic 131.4 mmHg over 12 readings.", key_points: [{ text: "131.4", fact_refs: ["tool:1"] }], numbers: [{ label: "औसत", value: 131.4, unit: "mmHg", ref: "tool:1" }] });
      const ok = run(env, draft, { knownRefs: known, refText: (r) => (r === "tool:1" ? text : null), evidenceTexts: [...env.vctx.evidenceTexts, text] });
      c.ok(!ok.violations.some(isNum), `got: ${codes(ok)}`);
      const unknown = run(env, draft);
      c.ok(unknown.violations.some((v) => v.code === "unknown_ref"), "tool:1 unknown without a tool call");
    }),
    caseOf(G, "verify:date-outside-range", "a date outside the loaded history is rejected", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { answer_en: "On 2026-05-01 the BP was high." }));
      c.ok(r.violations.some((v) => v.code === "unsupported_date"), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:date-in-range", "a date inside the loaded history is accepted", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { answer_en: "On 3 October the readings were stable." }));
      c.ok(!r.violations.some((v) => v.code === "unsupported_date"), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:impossible-date", "an impossible calendar date is rejected", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { answer_en: "On 31/02 the BP was high." }));
      c.ok(r.violations.some((v) => v.code === "unsupported_date"), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:future-date", "a future date is rejected", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { answer_en: "On 2026-10-09 the BP will be fine." }));
      c.ok(r.violations.some((v) => v.code === "unsupported_date"), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:clock-time", "a clock time that is not in the data is rejected; one from the data passes", async (c) => {
      const env = await verifyEnv("steady");
      const bad = run(env, goodDraft(env, { answer_en: "The reading at 03:47 was the highest." }));
      c.ok(bad.violations.some((v) => v.code === "unsupported_time"), `got: ${codes(bad)}`);
      const latest = env.ctx.bp[env.ctx.bp.length - 1];
      const ok = run(env, goodDraft(env, { answer_en: `The latest reading was at ${latest.time}.` }));
      c.ok(!ok.violations.some((v) => v.code === "unsupported_time"), `got: ${codes(ok)}`);
    }),
    caseOf(G, "verify:unknown-ref", "a citation to a ref that does not exist is rejected", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { key_points: [{ text: "ठीक है", fact_refs: ["bp:2020-01-01T00:00"] }] }));
      c.ok(r.violations.some((v) => v.code === "unknown_ref"), `got: ${codes(r)}`);
      const r2 = run(env, goodDraft(env, { numbers: [{ label: "x", value: 1, unit: "", ref: "made.up.fact" }] }));
      c.ok(r2.violations.some((v) => v.code === "unknown_ref"), "numbers[].ref");
    }),
    caseOf(G, "verify:url-must-come-from-search", "a source URL that web_search did not return is rejected; a returned one passes", async (c) => {
      const env = await verifyEnv("steady");
      const src = { title: "DASH eating plan", url: "https://www.nhlbi.nih.gov/education/dash-eating-plan", publisher: "NHLBI" };
      const rec = { text: "नमक कम करें और फल-सब्ज़ी बढ़ाएँ।", kind: "diet" as const, basis: "guideline" as const, source_urls: [src.url] };
      const bad = run(env, goodDraft(env, { sources: [src], recommendations: [rec] }));
      c.ok(bad.violations.some((v) => v.code === "unverified_url"), `got: ${codes(bad)}`);
      const good = run(env, goodDraft(env, { sources: [src], recommendations: [rec] }), { webUrls: new Set([src.url + "/"]) });
      c.ok(good.ok, `trailing-slash variant should pass, got: ${codes(good)}`);
    }),
    caseOf(G, "verify:guideline-needs-source", "basis=guideline without a source URL is rejected", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { recommendations: [{ text: "नमक कम करें।", kind: "diet", basis: "guideline", source_urls: [] }] }));
      c.ok(r.violations.some((v) => v.code === "missing_source"), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:guideline-number-needs-source", "a guideline figure is allowed only in a SOURCED recommendation, not in 'general' advice", async (c) => {
      const env = await verifyEnv("steady");
      const src = { title: "Salt", url: "https://www.who.int/news-room/fact-sheets/detail/salt-reduction", publisher: "WHO" };
      const web = new Set([src.url]);
      const sourced = run(env, goodDraft(env, { sources: [src], recommendations: [{ text: "WHO के अनुसार रोज़ 5 g से कम नमक लें।", kind: "diet", basis: "guideline", source_urls: [src.url] }] }), { webUrls: web });
      c.ok(sourced.ok, `sourced figure should pass, got: ${codes(sourced)}`);
      const general = run(env, goodDraft(env, { recommendations: [{ text: "रोज़ 5 g से कम नमक लें।", kind: "diet", basis: "general", source_urls: [] }] }));
      c.ok(general.violations.some((v) => isNum(v) && v.value === "5"), `unsourced 5 must be rejected, got: ${codes(general)}`);
    }),
    caseOf(G, "verify:general-advice-quantity", "everyday advice quantities ('20 मिनट टहलें') are fine in general advice; a step count is not", async (c) => {
      const env = await verifyEnv("steady");
      const ok = run(env, goodDraft(env, { recommendations: [{ text: "खाने के बाद 20 मिनट टहलें और 2 गिलास पानी पिएँ।", kind: "lifestyle", basis: "general", source_urls: [] }] }));
      c.ok(ok.ok, `got: ${codes(ok)}`);
      const bad = run(env, goodDraft(env, { recommendations: [{ text: "रोज़ 9999 कदम चलें।", kind: "lifestyle", basis: "general", source_urls: [] }] }));
      c.ok(bad.violations.some((v) => v.value === "9999"), `got: ${codes(bad)}`);
    }),
    caseOf(G, "verify:derived-number", "a declared derived number (difference of two evidence numbers) is accepted; an unrelated one is not", async (c) => {
      const env = await verifyEnv("steady");
      const a = env.ledger.byId["bp.7d.mean_sys"].value as number;
      const b = env.ledger.byId["bp.30d.mean_sys"].value as number;
      const diff = Math.round((a - b) * 10) / 10;
      const both = [{ text: "औसत सिस्टोलिक BP का फ़र्क", fact_refs: ["bp.7d.mean_sys", "bp.30d.mean_sys"] }];
      const ok = run(env, goodDraft(env, { key_points: both, numbers: [{ label: "7d minus 30d", value: Math.abs(diff), unit: "mmHg", ref: "bp.7d.mean_sys" }] }));
      c.ok(!ok.violations.some((v) => v.where === "numbers[0].value"), `derived diff should pass, got: ${codes(ok)}`);
      const bad = run(env, goodDraft(env, { key_points: both, numbers: [{ label: "made up", value: 77.7, unit: "mmHg", ref: "bp.7d.mean_sys" }] }));
      c.ok(bad.violations.some((v) => v.where === "numbers[0].value"), `unrelated 77.7 must fail, got: ${codes(bad)}`);
    }),
    caseOf(G, "verify:format-noise", "list markers, years, letter-prefixed digits (B12) and thousands separators are not mistaken for data", async (c) => {
      const env = await verifyEnv("steady");
      const steps = env.ledger.byId["steps.30d.total"]?.value as number;
      const withComma = steps.toLocaleString("en-US");
      const kp = [...goodDraft(env).key_points, { text: "कुल कदम", fact_refs: ["steps.30d.total"] }];
      const r = run(env, goodDraft(env, { key_points: kp, answer_en: `1. The mean BP was fine in 2026.\n2. Vitamin B12 is a doctor question.\n3. Total steps in 30 days: ${withComma}.` }));
      c.ok(!r.violations.some(isNum), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:dose-instruction", "telling the family to stop / raise / change a medicine is rejected (English, Devanagari, Hinglish)", async (c) => {
      const env = await verifyEnv("steady");
      for (const t of ["You should stop the medicine for a few days.", "दवा बंद कर दें।", "Dose badha dein agar BP high ho.", "Increase the dose of amlodipine."]) {
        const r = run(env, goodDraft(env, { answer_en: t }));
        c.ok(r.violations.some((v) => v.code === "dose_instruction"), `not rejected: ${t}`);
      }
    }),
    caseOf(G, "verify:dose-negation-ok", "'do not stop any medicine without asking the doctor' is allowed", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { answer_en: "Do not stop the medicine on your own; ask the doctor first.", answer_hi: "दवा अपने आप बंद न करें, पहले डॉक्टर से पूछें।" }));
      c.ok(!r.violations.some((v) => v.code === "dose_instruction"), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:dose-figure", "a dose figure that is not the patient's recorded dose is rejected; the recorded one passes", async (c) => {
      const env = await verifyEnv("steady");
      const bad = run(env, goodDraft(env, { answer_en: "A 10 mg tablet would help." }));
      c.ok(bad.violations.some((v) => v.code === "dose_instruction"), `got: ${codes(bad)}`);
      const ok = run(env, goodDraft(env, { answer_en: "Amlodipine 5 mg was taken on time." }));
      c.ok(!ok.violations.some((v) => v.code === "dose_instruction"), `got: ${codes(ok)}`);
    }),
    caseOf(G, "verify:diagnosis-guarantee-doctor", "definitive diagnosis, guarantees/cures and 'no need to see a doctor' are rejected", async (c) => {
      const env = await verifyEnv("steady");
      const cases: Array<[string, string]> = [
        ["He definitely has diabetes.", "definitive_diagnosis"],
        ["पापा को डायबिटीज है।", "definitive_diagnosis"],
        ["This diet is guaranteed to lower BP.", "guarantee"],
        ["This will cure hypertension.", "guarantee"],
        ["There is no need to see a doctor.", "replace_doctor"],
      ];
      for (const [t, code] of cases) {
        const r = run(env, goodDraft(env, { answer_en: t }));
        c.ok(r.violations.some((v) => v.code === code), `${code} not raised for: ${t} (got ${codes(r)})`);
      }
    }),
    caseOf(G, "verify:false-reassurance", "'nothing to worry' is rejected when the ledger carries an alert", async (c) => {
      const env = await verifyEnv("crisis");
      c.ok(env.vctx.hasAlertFlag, "fixture should carry an alert flag");
      const r = run(env, goodDraft(env, { answer_en: "There is nothing to worry about." }));
      c.ok(r.violations.some((v) => v.code === "false_reassurance"), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:medicine-request-needs-doctor", "for a medicine-change request the answer must set needs_doctor and include ask_doctor", async (c) => {
      const env = await verifyEnv("steady", "dawai band kar du kya");
      c.ok(env.vctx.medicineChangeRequest, "request flagged");
      const bad = run(env, goodDraft(env));
      c.ok(bad.violations.some((v) => v.code === "needs_doctor_missing"), `got: ${codes(bad)}`);
      const ok = run(env, goodDraft(env, { needs_doctor: true, safety_level: "attention", recommendations: [{ text: "डॉक्टर से पूछें कि दवा का क्या करना है; ऐप का दवा-पालन डेटा साथ दिखाएँ।", kind: "ask_doctor", basis: "patient_data", source_urls: [] }] }));
      c.ok(!ok.violations.some((v) => v.code === "needs_doctor_missing"), `got: ${codes(ok)}`);
    }),
    caseOf(G, "verify:malformed", "malformed submissions are rejected with field-level messages", async (c) => {
      const env = await verifyEnv("steady");
      const d = goodDraft(env) as unknown as Record<string, unknown>;
      const missing = { ...d };
      delete missing.answer_hi;
      c.ok(!run(env, missing).ok, "missing answer_hi");
      c.ok(!run(env, { ...d, confidence: "certain" }).ok, "bad confidence enum");
      c.ok(!run(env, { ...d, key_points: [{ text: 1 }] }).ok, "bad key point");
      c.ok(!run(env, "not an object").ok, "non-object");
      c.ok(!run(env, null).ok, "null");
    }),
    caseOf(G, "verify:limits", "over-long and empty fields are rejected", async (c) => {
      const env = await verifyEnv("steady");
      c.ok(run(env, goodDraft(env, { headline: "x".repeat(400) })).violations.some((v) => v.code === "too_long"), "long headline");
      c.ok(run(env, goodDraft(env, { answer_hi: "  " })).violations.some((v) => v.code === "empty"), "empty answer");
    }),
    caseOf(G, "verify:coverage-range", "data_coverage outside the loaded history is rejected", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { data_coverage: { metrics: ["bp"], range: { from: "2025-01-01", to: T }, n: 5 } }));
      c.ok(r.violations.some((v) => v.where === "data_coverage.range"), `got: ${codes(r)}`);
    }),
    caseOf(G, "verify:repair-message", "violations are reported with the exact offending value so the model can fix them", async (c) => {
      const env = await verifyEnv("steady");
      const r = run(env, goodDraft(env, { answer_en: "Mean BP was 151.3 mmHg." }));
      const v = r.violations.find((x) => x.code === "unsupported_number");
      c.ok(Boolean(v && v.value === "151.3" && v.where === "answer_en"), "violation carries where + value");
    }),
  );

  // The deterministic engine's own answers must pass the verifier where the evidence covers them.
  for (const [q, arch] of [
    ["pichle 7 din ka average BP", "steady"],
    ["weight target se kitna door hai", "steady"],
    ["dawai adherence kitni rahi", "missed_meds"],
  ] as Array<[string, ArchetypeId]>) {
    out.push(
      caseOf(G, `verify:rules-answer:${arch}:${q}`, `[${arch}] the rules engine's own answer to "${q}" passes the verifier (no false positives)`, async (c) => {
        const { answerWithRules } = await import("../fallback");
        const env = await verifyEnv(arch, q);
        const r = answerWithRules({ message: q, ctx: env.ctx, ledger: env.ledger });
        const res = run(env, r.answer, { evidenceTexts: [...env.vctx.evidenceTexts, JSON.stringify(env.ctx.bp.concat([]).slice(-50))] });
        const numeric = res.violations.filter((v) => v.code === "unsupported_number" || v.code === "unsupported_date" || v.code === "unsupported_time");
        c.ok(numeric.length === 0, `rules answer should verify numerically, got: ${numeric.map((v) => `${v.code}:${v.value}@${v.where}`).join(", ")}`);
      }),
    );
  }

  return out;
}
