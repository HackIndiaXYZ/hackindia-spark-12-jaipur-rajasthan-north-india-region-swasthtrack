/**
 * Drives the REAL @anthropic-ai/sdk (through src/services/soie/anthropic-client.ts)
 * against a local fake Messages API that streams Server-Sent Events:
 *
 *   npm run soie:wire
 *
 * It proves, without a network or a key, that the request we build has the
 * intended shape (adaptive thinking, output_config.effort, strict tools, web
 * search server tool, cached system prompt, no forced tool_choice, no sampling
 * parameters) and that the SDK's stream parsing yields what the agent loop
 * expects (thinking, server_tool_use, web_search_tool_result, tool_use with
 * streamed JSON input). It does NOT prove the live API accepts the request.
 */
import http from "node:http";
import { src } from "./soie-node-hooks.mjs";

const server = http.createServer();
const bodies = [];
let call = 0;
let draft;
const sse = (res, events) => {
  res.writeHead(200, { "content-type": "text/event-stream", "request-id": "req_test" });
  for (const [e, d] of events) res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`);
  res.end();
};
const usage = (o) => ({ input_tokens: 100, output_tokens: o, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 });
const URL_DASH = "https://www.nhlbi.nih.gov/education/dash-eating-plan";

server.on("request", (req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    bodies.push({ headers: req.headers, body: JSON.parse(b), url: req.url });
    call++;
    const start = { type: "message_start", message: { id: `msg_${call}`, type: "message", role: "assistant", content: [], model: "claude-opus-5-5", stop_reason: null, stop_sequence: null, stop_details: null, usage: usage(1) } };
    if (call === 1) {
      return sse(res, [
        ["message_start", start],
        ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }],
        ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sigA" } }],
        ["content_block_stop", { type: "content_block_stop", index: 0 }],
        ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {}, caller: { type: "direct" } } }],
        ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"query":"DASH diet salt Indian meals"}' } }],
        ["content_block_stop", { type: "content_block_stop", index: 1 }],
        ["content_block_start", { type: "content_block_start", index: 2, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [{ type: "web_search_result", title: "DASH", url: URL_DASH, encrypted_content: "x", page_age: null }], caller: { type: "direct" } } }],
        ["content_block_stop", { type: "content_block_stop", index: 2 }],
        ["content_block_start", { type: "content_block_start", index: 3, content_block: { type: "tool_use", id: "toolu_1", name: "get_overview", input: {}, caller: { type: "direct" } } }],
        ["content_block_delta", { type: "content_block_delta", index: 3, delta: { type: "input_json_delta", partial_json: '{"detail":' } }],
        ["content_block_delta", { type: "content_block_delta", index: 3, delta: { type: "input_json_delta", partial_json: '"summary"}' } }],
        ["content_block_stop", { type: "content_block_stop", index: 3 }],
        ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null, stop_details: null }, usage: { output_tokens: 42 } }],
        ["message_stop", { type: "message_stop" }],
      ]);
    }
    const json = JSON.stringify(draft);
    return sse(res, [
      ["message_start", start],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_2", name: "submit_answer", input: {}, caller: { type: "direct" } } }],
      ...json.match(/[\s\S]{1,300}/g).map((p) => ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: p } }]),
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null, stop_details: null }, usage: { output_tokens: 300 } }],
      ["message_stop", { type: "message_stop" }],
    ]);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;

const V = await import(src("services/soie/eval/cases-verify.ts"));
const E = await import(src("services/soie/engine.ts"));
const X = await import(src("services/soie/eval/fixtures.ts"));
const C = await import(src("services/soie/anthropic-client.ts"));

const env = await V.verifyEnv("steady", "BP kaise kam karein");
draft = {
  ...V.goodDraft(env),
  sources: [{ title: "DASH", url: URL_DASH, publisher: "NHLBI" }],
  recommendations: [{ text: "नमक कम करें और फल-सब्ज़ी बढ़ाएँ।", kind: "diet", basis: "guideline", source_urls: [URL_DASH] }],
};
const seen = [];
const r = await E.runTurn(
  { ctx: env.ctx, message: "BP kaise kam karein", history: [], canWrite: true },
  { client: C.createAnthropicClient("sk-ant-test"), model: "claude-opus-5-5", effort: "high", webSearch: true, deps: { saveMemory: async () => ({ id: "x" }) }, now: X.FIXTURE_NOW, emit: (e) => seen.push(e.type === "status" ? e.stage : `${e.type}:${e.name}`) },
);

const fails = [];
const check = (cond, msg) => cond || fails.push(msg);
const b = bodies[0].body;
check(r.answer.engine === "ai" && r.answer.validation === "passed", `answer not accepted: ${JSON.stringify(r.agent?.failure)}`);
check(r.answer.webSearchUsed && r.answer.sources.length === 1, "web search / sources not surfaced");
check(r.agent?.telemetry.cacheReadTokens === 100 && r.agent?.telemetry.inputTokens === 200, "usage not accumulated");
check(bodies[0].url === "/v1/messages" && bodies[0].headers["x-api-key"] === "sk-ant-test", "endpoint / auth header");
check(b.stream === true && b.model === "claude-opus-5-5", "stream/model");
check(JSON.stringify(b.thinking) === '{"type":"adaptive"}', "thinking must be adaptive");
check(b.output_config?.effort === "high", "effort");
check(b.tool_choice === undefined && b.temperature === undefined && b.top_p === undefined && b.top_k === undefined, "no forced tool_choice or sampling parameters");
check(b.tools.filter((t) => !t.type || t.type === "custom").every((t) => t.strict === true), "custom tools must be strict");
check(b.tools.some((t) => t.type === "web_search_20260209" && t.max_uses === 4), "web search server tool");
check(b.system[0].cache_control?.type === "ephemeral" && b.cache_control?.type === "ephemeral", "cache breakpoints");
check(bodies[1].body.messages.map((m) => m.role).join() === "user,assistant,user", "message alternation on the 2nd request");
check(bodies[1].body.messages[1].content.map((c) => c.type).join() === "thinking,server_tool_use,web_search_tool_result,tool_use", "assistant turn replayed unchanged (thinking + server tool blocks)");
check(bodies[1].body.messages[2].content.length === 1 && bodies[1].body.messages[2].content[0].type === "tool_result", "tool_result in ONE user message");
check(seen.includes("searching") && seen.includes("checking"), `progress stages: ${seen.join(">")}`);

server.close();
if (fails.length) {
  console.log(`SOIE wire check: ${fails.length} problem(s)`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("SOIE wire check: OK (request shape and SDK stream parsing verified against a local fake API; the live API was not called)");
process.exit(0);
