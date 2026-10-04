/**
 * Scripted fake LLM client: replays a fixed list of turns and records every
 * request it receives, so tests can assert on the exact messages the loop sent
 * (tool_results in ONE user message, pause_turn re-send, repair errors, ...).
 * No network, no SDK calls.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmHooks, LlmRequest, LlmTurn } from "../agent";

export type ScriptStep = LlmTurn | ((req: LlmRequest, call: number) => LlmTurn | Promise<LlmTurn>) | Error;

export interface ScriptedClient extends LlmClient {
  requests: LlmRequest[];
  /** Deep copies of `messages` at the moment of each call (the loop mutates its array). */
  snapshots: Anthropic.MessageParam[][];
}

export function scripted(steps: ScriptStep[]): ScriptedClient {
  const requests: LlmRequest[] = [];
  const snapshots: Anthropic.MessageParam[][] = [];
  let call = 0;
  return {
    requests,
    snapshots,
    async complete(req: LlmRequest, hooks: LlmHooks, signal?: AbortSignal): Promise<LlmTurn> {
      requests.push(req);
      snapshots.push(JSON.parse(JSON.stringify(req.messages)));
      const idx = call++;
      const step = steps[Math.min(idx, steps.length - 1)];
      if (signal?.aborted) throw new Error("aborted");
      if (step instanceof Error) throw step;
      const turn = typeof step === "function" ? await step(req, idx) : step;
      if (turn.content.some((b) => b.type === "server_tool_use")) hooks.onServerToolStart?.("web_search");
      return turn;
    },
  };
}

/** A client that never answers until aborted (for the timeout test). */
export function hanging(): LlmClient {
  return {
    complete(_req, _hooks, signal) {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    },
  };
}

const usage = { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

export function turn(content: unknown[], stop: LlmTurn["stop_reason"], extra: Partial<LlmTurn> = {}): LlmTurn {
  return { content: content as Anthropic.ContentBlock[], stop_reason: stop, stop_details: null, usage, model: "claude-opus-5-5", ...extra };
}

export const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input, caller: { type: "direct" } });
export const textBlock = (t: string) => ({ type: "text", text: t, citations: null });
export const thinkingBlock = () => ({ type: "thinking", thinking: "", signature: "sig" });

export function webSearchBlocks(id: string, query: string, results: Array<{ title: string; url: string }>) {
  return [
    { type: "server_tool_use", id, name: "web_search", input: { query }, caller: { type: "direct" } },
    {
      type: "web_search_tool_result",
      tool_use_id: id,
      content: results.map((r) => ({ type: "web_search_result", title: r.title, url: r.url, encrypted_content: "x", page_age: null })),
      caller: { type: "direct" },
    },
  ];
}
