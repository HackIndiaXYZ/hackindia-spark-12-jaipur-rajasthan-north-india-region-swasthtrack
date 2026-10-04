/**
 * Production LlmClient over the official Anthropic SDK. Server-only.
 *
 * Request shape follows the current API for Claude Opus 5.5: adaptive thinking
 * is the only mode (no budget_tokens, no sampling parameters), depth is set with
 * output_config.effort, tool_choice stays at the default `auto` because forced
 * tool use is rejected, and the request is streamed (large max_tokens + long
 * agentic turns must not hit HTTP timeouts).
 *
 * Prompt caching: the stable system prompt carries an explicit breakpoint (so the
 * tools + system prefix is reused across requests and users), and the top-level
 * automatic breakpoint extends the cache through the tool loop.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmTurn } from "./agent";

export function createAnthropicClient(apiKey: string): LlmClient {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  return {
    async complete(req, hooks, signal) {
      const stream = client.messages.stream(
        {
          model: req.model,
          max_tokens: req.max_tokens,
          system: req.system,
          tools: req.tools,
          messages: req.messages,
          thinking: { type: "adaptive" },
          output_config: { effort: req.effort },
          cache_control: { type: "ephemeral" },
        },
        { signal, timeout: req.timeoutMs },
      );
      stream.on("streamEvent", (event) => {
        if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
          hooks.onServerToolStart?.(event.content_block.name);
        }
      });
      const msg = await stream.finalMessage();
      const turn: LlmTurn = {
        content: msg.content,
        stop_reason: msg.stop_reason,
        stop_details: msg.stop_details ?? null,
        usage: {
          input_tokens: msg.usage.input_tokens,
          output_tokens: msg.usage.output_tokens,
          cache_read_input_tokens: msg.usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: msg.usage.cache_creation_input_tokens ?? 0,
        },
        model: msg.model,
      };
      return turn;
    },
  };
}
