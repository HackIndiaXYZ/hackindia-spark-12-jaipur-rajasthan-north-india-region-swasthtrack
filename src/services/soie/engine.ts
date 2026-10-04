/**
 * One SOIE turn, end to end, independent of HTTP and Supabase.
 *
 *   ledger -> safety gate -> (emergency answer | AI agent | rules engine) -> final answer
 *
 * The route handler supplies the loaded context, the model client (or null when
 * there is no API key) and persistence hooks; the evaluation harness calls this
 * same function with fixtures and a scripted client. Failure of the AI path is
 * never silent: it always produces the rules-engine answer plus a visible notice.
 */

import { runAgent, type AgentResult, type Effort, type LlmClient } from "./agent";
import { finalizeAnswer, notice } from "./answer";
import { answerWithRules } from "./fallback";
import { buildLedger, dataPointCount } from "./ledger";
import type { HistoryTurn } from "./prompt";
import { assessSafety, buildEmergencyAnswer } from "./safety";
import type { ToolDeps } from "./tools";
import type { Notice, PatientContext, ProgressEvent, SoieAnswer, TraceStep, TurnTelemetry } from "./types";

export type EventStatus = "success" | "refused" | "emergency" | "no_data" | "validation_failed" | "fallback" | "error" | "rate_limited";

export interface TurnConfig {
  /** null = no API key: the rules engine answers and says so. */
  client: LlmClient | null;
  model: string;
  effort: Effort;
  webSearch: boolean;
  deps: ToolDeps;
  emit?: (e: ProgressEvent) => void;
  signal?: AbortSignal;
  deadlineMs?: number;
  now?: Date;
}

export interface TurnInput {
  ctx: PatientContext;
  message: string;
  history: HistoryTurn[];
  canWrite: boolean;
}

export interface TurnResult {
  answer: SoieAnswer;
  status: EventStatus;
  intent: string;
  telemetry: TurnTelemetry;
  trace: TraceStep[];
  agent: AgentResult | null;
  privacyFlags: number;
}

const emptyTelemetry = (): TurnTelemetry => ({ intent: null, toolsUsed: [], dataPoints: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, webSearches: 0, repairs: 0 });

export async function runTurn(input: TurnInput, cfg: TurnConfig): Promise<TurnResult> {
  const { ctx } = input;
  const now = cfg.now ?? new Date(ctx.generatedAt);
  const emit = cfg.emit ?? (() => {});
  const t0 = Date.now();
  const trace: TraceStep[] = [];
  const step = (kind: TraceStep["kind"], label: string, detail?: string) => trace.push({ t: Date.now() - t0, kind, label, detail });

  const ledger = buildLedger(ctx, now);
  const latestBP = ctx.bp[ctx.bp.length - 1] ?? null;
  const safety = assessSafety(input.message, { latestBP, thresholds: ctx.goals.bp, now });
  step("safety", "assessed", [safety.emergency ? `emergency:${safety.emergencyReasons.join("+")}` : "", safety.crisisReading ? "crisis_reading" : "", safety.medicineChangeRequest ? "med_change" : "", safety.diagnosisRequest ? "diagnosis" : "", safety.injectionDetected ? "injection" : ""].filter(Boolean).join(",") || "clear");
  step("context", "loaded", `bp=${ctx.bp.length} food=${ctx.food.length} doses=${ctx.doses.length} facts=${ledger.facts.length}`);

  const common = { ctx, ledger, safety };
  const noData = ledger.flags.some((f) => f.id === "no_data");

  // 1. Emergency: fixed answer, no model.
  if (safety.emergency) {
    const draft = buildEmergencyAnswer(safety.emergencyReasons, latestBP, { from: ctx.range.from, to: ctx.today });
    const answer = finalizeAnswer(draft, { ...common, engine: "safety", model: null, webSearchUsed: false, validation: "not_applicable", notices: [], skipCrisisLead: true });
    return { answer, status: "emergency", intent: "emergency", telemetry: { ...emptyTelemetry(), intent: "emergency", dataPoints: latestBP ? 1 : 0 }, trace, agent: null, privacyFlags: 0 };
  }

  const rules = (notices: Notice[], status: EventStatus, agent: AgentResult | null): TurnResult => {
    emit({ type: "status", stage: "writing", hi: "नियम-आधारित जवाब बना रहा हूँ", en: "Building the rules-based answer" });
    const r = answerWithRules({ message: safety.sanitized, ctx, ledger, safety });
    step("fallback", "rules engine", r.intent);
    const answer = finalizeAnswer(r.answer, { ...common, engine: "rules", model: null, webSearchUsed: false, validation: agent ? "fallback" : "not_applicable", notices });
    const base = agent?.telemetry ?? emptyTelemetry();
    return { answer, status: noData && status === "fallback" ? "no_data" : status, intent: r.intent, telemetry: { ...base, intent: r.intent, dataPoints: base.dataPoints || dataPointCount(ctx) }, trace: [...trace, ...(agent?.trace ?? [])], agent, privacyFlags: agent?.privacyFlags ?? 0 };
  };

  // 2. No API key: rules engine, said out loud.
  if (!cfg.client) {
    for (const n of [notice("no_api_key")]) emit({ type: "notice", notice: n });
    return rules([notice("no_api_key")], "fallback", null);
  }

  // 3. AI agent.
  const agent = await runAgent({
    client: cfg.client,
    model: cfg.model,
    effort: cfg.effort,
    ctx,
    ledger,
    safety,
    message: safety.sanitized,
    history: input.history,
    webSearch: cfg.webSearch,
    canWrite: input.canWrite,
    deps: cfg.deps,
    emit,
    signal: cfg.signal,
    deadlineMs: cfg.deadlineMs,
  });

  if (agent.draft) {
    const notices: Notice[] = cfg.webSearch ? [] : [notice("web_search_off")];
    const answer = finalizeAnswer(agent.draft, { ...common, engine: "ai", model: agent.model, webSearchUsed: agent.webSearchUsed, validation: agent.validation ?? "passed", notices, toolEvidence: agent.toolEvidence });
    const refused = answer.refusal.trim().length > 0;
    return { answer, status: refused ? "refused" : noData ? "no_data" : "success", intent: "ai", telemetry: { ...agent.telemetry, intent: "ai" }, trace: [...trace, ...agent.trace], agent, privacyFlags: agent.privacyFlags };
  }

  const reason = agent.failure?.reason ?? "api_error";
  const [n, status]: [Notice, EventStatus] =
    reason === "refusal" ? [notice("ai_refused"), "refused"] : reason === "verification_failed" ? [notice("verification_fallback"), "validation_failed"] : [notice("ai_unavailable"), "fallback"];
  emit({ type: "notice", notice: n });
  return rules([n], status, agent);
}

