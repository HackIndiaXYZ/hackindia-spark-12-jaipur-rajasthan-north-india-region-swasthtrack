import { HttpError, errorResponse, requirePatientAccess, requireUser } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/services/soie/anthropic-client";
import type { Effort, LlmClient } from "@/services/soie/agent";
import { ContextLoadError, loadPatientContext, makeToolDeps } from "@/services/soie/context";
import { runTurn, type EventStatus, type TurnResult } from "@/services/soie/engine";
import { sanitizeText } from "@/services/soie/normalize";
import { countRecentEvents, ensureSession, loadHistory, rateLimitPerHour, recordEvent, saveTurn } from "@/services/soie/persist";
import type { ProgressEvent } from "@/services/soie/types";

/**
 * POST /api/soie  — the SOIE assistant.
 *
 * Auth: `Authorization: Bearer <Supabase access token>` (see authFetch). The
 * patient is checked against `patient_members`, and every query then runs as the
 * user so RLS applies. The client never supplies assistant history: it is loaded
 * from the database by session id.
 *
 * Streams Server-Sent Events when `Accept: text/event-stream`:
 *   event: status  data: {stage, hi, en}
 *   event: tool    data: {name, hi}
 *   event: notice  data: {notice}
 *   event: answer  data: {sessionId, messageId, status, answer, trace?}
 *   event: error   data: {message}
 * Otherwise returns the final payload as JSON.
 *
 * Nothing here logs message text or health values.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_MESSAGE_CHARS = 1000;
const MAX_BODY_BYTES = 20_000;
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

function config() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || "";
  const effort = EFFORTS.includes(process.env.SOIE_EFFORT as Effort) ? (process.env.SOIE_EFFORT as Effort) : "high";
  const timeout = Number(process.env.SOIE_TIMEOUT_MS);
  return {
    hasKey: apiKey.length > 0,
    apiKey,
    model: process.env.SOIE_MODEL?.trim() || "claude-opus-5-5",
    effort,
    webSearch: process.env.SOIE_WEB_SEARCH !== "false",
    deadlineMs: Number.isFinite(timeout) && timeout >= 10_000 ? Math.min(timeout, 110_000) : 100_000,
  };
}

let cachedClient: { key: string; client: LlmClient } | null = null;
function llmClient(key: string): LlmClient {
  if (!cachedClient || cachedClient.key !== key) cachedClient = { key, client: createAnthropicClient(key) };
  return cachedClient.client;
}

export async function GET(request: Request) {
  try {
    await requireUser(request);
    const c = config();
    return Response.json({ ai: c.hasKey, webSearch: c.hasKey && c.webSearch, model: c.hasKey ? c.model : null, rateLimitPerHour: rateLimitPerHour() });
  } catch (err) {
    return errorResponse(err);
  }
}

interface Body {
  patientId?: unknown;
  message?: unknown;
  sessionId?: unknown;
}

async function readBody(request: Request): Promise<{ patientId: string; message: string; sessionId: string | null }> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  if (typeof body.patientId !== "string") throw new HttpError(400, "patientId is required");
  if (typeof body.message !== "string") throw new HttpError(400, "message is required");
  const message = sanitizeText(body.message);
  if (message.length < 1) throw new HttpError(400, "message must not be empty");
  if (message.length > MAX_MESSAGE_CHARS) throw new HttpError(400, `message is too long (max ${MAX_MESSAGE_CHARS} characters)`);
  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null;
  return { patientId: body.patientId, message, sessionId };
}

export async function POST(request: Request) {
  const started = Date.now();
  try {
    // Authenticate before reading the body, and refuse oversized bodies outright.
    const { user, supabase } = await requireUser(request);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new HttpError(413, "Request is too large");
    const { patientId, message, sessionId: requestedSession } = await readBody(request);
    const { role } = await requirePatientAccess(supabase, user.id, patientId, false);
    const canWrite = role !== "viewer";
    const cfg = config();

    // Abuse / cost guard: count this user's questions in the last hour.
    const limit = rateLimitPerHour();
    if ((await countRecentEvents(supabase, user.id)) >= limit) {
      await recordEvent(supabase, { userId: user.id, sessionId: null, patientId, status: "rate_limited", telemetry: {}, latencyMs: 0, model: null }).catch(() => {});
      return Response.json(
        { error: `आपने पिछले एक घंटे में बहुत सारे सवाल पूछ लिए हैं (सीमा ${limit})। कुछ देर बाद फिर कोशिश करें।`, code: "rate_limited", limit },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    }

    // Admin-only developer trace.
    const prof = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { role?: string } | null }> } } } })
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const isAdmin = prof.data?.role === "admin";

    const wantsStream = (request.headers.get("accept") ?? "").includes("text/event-stream");

    const work = async (emit: (e: ProgressEvent) => void): Promise<Record<string, unknown>> => {
      emit({ type: "status", stage: "reading", hi: "डेटा पढ़ रहा हूँ", en: "Reading the data" });
      let ctx;
      try {
        ctx = await loadPatientContext(supabase, patientId);
      } catch (e) {
        if (e instanceof ContextLoadError) throw new HttpError(e.status, e.message);
        throw e;
      }
      const sessionId = await ensureSession(supabase, user.id, patientId, requestedSession, message);
      const history = sessionId ? await loadHistory(supabase, sessionId) : [];

      let result: TurnResult;
      try {
        result = await runTurn(
          { ctx, message, history, canWrite },
          { client: cfg.hasKey ? llmClient(cfg.apiKey) : null, model: cfg.model, effort: cfg.effort, webSearch: cfg.webSearch, deps: makeToolDeps(supabase, patientId), emit, signal: request.signal, deadlineMs: cfg.deadlineMs },
        );
      } catch (err) {
        // The engine itself failed (a bug, not a model problem): record it and say so. Name only: never message text or data.
        console.error("SOIE turn failed:", err instanceof Error ? err.name : "unknown");
        await recordEvent(supabase, { userId: user.id, sessionId, patientId, status: "error", telemetry: {}, latencyMs: Date.now() - started, model: null }).catch(() => {});
        throw new HttpError(500, "SOIE could not produce an answer. Please try again.");
      }

      let messageId: string | null = null;
      if (sessionId) {
        const saved = await saveTurn(supabase, sessionId, message, result.answer).catch(() => null);
        messageId = saved?.assistantMessageId ?? null;
      }
      await recordEvent(supabase, { userId: user.id, sessionId, patientId, status: result.status as EventStatus, telemetry: result.telemetry, latencyMs: Date.now() - started, model: result.answer.model }).catch(() => {});

      return {
        sessionId,
        messageId,
        status: result.status,
        answer: result.answer,
        ...(isAdmin
          ? {
              trace: {
                steps: result.trace,
                telemetry: result.telemetry,
                intent: result.intent,
                webUrls: result.agent?.webUrls ?? [],
                failure: result.agent?.failure ?? null,
                privacyFlags: result.privacyFlags,
                config: { model: cfg.model, effort: cfg.effort, webSearch: cfg.webSearch, hasKey: cfg.hasKey },
              },
            }
          : {}),
      };
    };

    if (!wantsStream) {
      const payload = await work(() => {});
      return Response.json(payload);
    }

    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            // client went away
          }
        };
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            // closed
          }
        }, 15_000);
        try {
          const payload = await work((e) => {
            if (e.type === "status") send("status", { stage: e.stage, hi: e.hi, en: e.en });
            else if (e.type === "tool") send("tool", { name: e.name, hi: e.hi });
            else send("notice", { notice: e.notice });
          });
          send("answer", payload);
        } catch (err) {
          const status = err instanceof HttpError ? err.status : 500;
          if (!(err instanceof HttpError)) console.error("SOIE stream error:", err instanceof Error ? err.name : "unknown");
          send("error", { status, message: err instanceof HttpError ? err.message : "Something went wrong on the server" });
        } finally {
          if (heartbeat) clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      },
      cancel() {
        if (heartbeat) clearInterval(heartbeat);
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
