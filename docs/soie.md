# SOIE: the SwasthTrack assistant

SOIE answers questions about ONE patient from ALL of that patient's logged data, and, for diet / lifestyle / health problems, also searches the web and gives a sourced, practical plan. Its design rule: **numbers come from code, never from the model.** A language model reads and explains; code computes, cites and verifies.

UI: `/ask` · API: `POST /api/soie` · admin diagnostics: `/simulation-lab` · code: `src/services/soie/`

## What it does, step by step

```
browser ──(Bearer token, SSE)──▶ POST /api/soie
   1. requireUser + requirePatientAccess(read)       (auth, membership; RLS does the real scoping)
   2. validate (1-1000 chars, control chars stripped) + hourly rate limit (counts soie_events)
   3. loadPatientContext  ── user-scoped Supabase client, 120 IST days, paged past 1000 rows
   4. fact ledger         ── ~350 facts, every one with window + n (pure code)
   5. safety gate         ── emergency? crisis reading? medicine/diagnosis request? injection?
   6a. emergency          ── fixed answer (112/108, FAST, last BP), NO model call
   6b. ANTHROPIC_API_KEY  ── agent loop: tools + web_search → submit_answer → verifier
   6c. no key / outage / refusal / failed verification ── deterministic rules engine + visible notice
   7. finalize            ── crisis reading forced to the top, evidence resolved, notices attached
   8. persist             ── soie_sessions / soie_messages (+answer jsonb) / soie_events (counters only)
```

### Modules (`src/services/soie/`)

| File | Role | Pure? |
|---|---|---|
| `types.ts` | Answer contract, context, ledger types | yes |
| `normalize.ts` | NFC / Devanagari folding, whole-token lexicons (Hindi, Hinglish, English), "did you mean" | yes |
| `temporal.ts` | IST date resolver: aaj/kal/parso, pichle N din, last week, is mahine, weekdays, 15 August, DD/MM, ISO, ranges; validates real dates | yes |
| `safety.ts` | Emergency detection, crisis readings, medicine-change / diagnosis / remember requests, prompt-injection hygiene, the fixed emergency answer | yes |
| `records.ts` | Raw rows → typed, ref-stamped records; expected-dose builder (schedule × days) | yes |
| `ledger.ts` | The analytics engine: stats per window, adherence, nutrition, completeness, flags, associations | yes |
| `evidence.ts` | Citation index (fact ids, record refs) and chip resolution | yes |
| `verify.ts` | The accuracy guarantee (below) | yes |
| `fallback.ts` | Deterministic rule engine: intents → ledger-rendered bilingual answers | yes |
| `answer.ts` | Final assembly, crisis lead, honest notices | yes |
| `prompt.ts`, `tools.ts` | Stable system prompt, strict tool schemas, tool executors | yes (`save_memory` via injected dep) |
| `agent.ts` | The Claude loop over an injectable `LlmClient` | yes (no SDK values) |
| `anthropic-client.ts` | The real `LlmClient` (official SDK, streaming) | server only |
| `engine.ts` | One turn end to end (shared by the route and the eval harness) | yes |
| `context.ts`, `persist.ts` | Supabase IO (paging, sessions, events) | server only |
| `eval/` | Fixtures, 243 cases, scripted fake model, fake Supabase | test only |

## The accuracy guarantee (`verify.ts`)

Before an AI answer reaches the user, code checks it. A failure is returned to the model as an `is_error` tool result with the exact offending items (max 2 repairs); after that the rules engine answers and says why.

- **Numbers.** Every number in the headline, both answers, key points and patient-data recommendations must appear in this turn's evidence (the snapshot, `get_overview` facts, or a tool result), allowing only documented rounding to 0/1/2 decimals. A number that exists somewhere in the data but is **not backed by anything the answer cites** (`fact_refs` / `numbers[].ref`) is rejected as `uncited_number`; a number found nowhere is `unsupported_number`. Derived values (difference, sum, ratio, percentage) are accepted only when declared in `numbers[]` and derivable from facts the answer cites.
- **Dates and times.** Calendar mentions must be real dates inside the loaded history; clock times must exist in the data.
- **Citations.** Every `fact_ref` must be a fact id, a record ref (`bp:2026-10-03T08:15`) or a `tool:N` tag from this turn.
- **Sources.** Every URL must have appeared in a `web_search` result this turn; `basis: "guideline"` needs one. A guideline figure is allowed in prose only inside a sourced recommendation (code cannot verify guideline numbers; the source link is the accountability).
- **Forbidden content.** Start/stop/change-dose advice, doses that are not the patient's recorded ones, definitive diagnoses, guarantees/cures, "no need for a doctor", and false reassurance when the ledger carries an alert (with a negation guard so "do not stop the medicine on your own" passes).
- **Required content.** For a medicine-change or diagnosis request: `needs_doctor` and an `ask_doctor` recommendation.

**What it does not do:** it cannot judge whether a sentence is *wise*, check spelled-out numbers ("तीन"), or confirm that a guideline claim matches its source. It checks traceability, not medical correctness.

## Safety model

1. **Emergency gate (before any model).** Hindi / Hinglish / English / Devanagari symptom phrases (chest pain, breathlessness, face droop, slurred speech, one-sided weakness, sudden severe headache, vision loss, confusion, fainting, seizure, vomiting blood, severe bleeding, unresponsive, suspected stroke) with simple negation handling ("seene mein dard nahi hai" is not an alarm). Result: a fixed answer: call 112/108 now, note the onset time, FAST signs, no food/drink/medicine until the crew says so, and the last logged BP. Tap-to-call `tel:` buttons in the UI. `safety_level: "escalate"`.
2. **Crisis reading.** If the latest logged reading (within 24 h) or a reading the user types is in the crisis range (`classifyBP`), the answer leads with it whatever was asked. The text is prepended by code, so the model cannot omit it.
3. **No dose / diagnosis advice.** Detected from the question, enforced by the verifier, repeated in the prompt.
4. **Untrusted text.** The question, saved notes, free text in records and web results are data. Instruction-like phrases are removed from the question (English and Hindi), angle brackets are stripped so user text cannot close our delimiters, record text is sanitised on load, and `save_memory` is refused unless the user's own message asked to remember something (so injected web content cannot write memory).
5. **Privacy.** The patient's **name is never sent to the model.** Web queries must be generic; queries that look like they contain readings or dates are flagged in the admin trace. Telemetry rows hold ids and counters only. No message text or health values are logged.
6. **Auth.** Bearer token → `requireUser` → membership check → every query runs as the user (RLS). Assistant history comes from the database by session id, never from the client (a client could forge assistant turns).

## Configuration (server environment)

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Enables the AI path. Without it SOIE answers from the rules engine and says so. |
| `SOIE_MODEL` | `claude-opus-5-5` | Model id. |
| `SOIE_EFFORT` | `high` | `output_config.effort`: low / medium / high / xhigh / max. |
| `SOIE_WEB_SEARCH` | `true` | `false` removes the web search tool. |
| `SOIE_RATE_LIMIT_PER_HOUR` | `40` | Questions per user per rolling hour (429 beyond). |
| `SOIE_TIMEOUT_MS` | `100000` | Whole-turn deadline (10 000 to 110 000); the route `maxDuration` is 120 s. |

Database: run `supabase/migrations/20261004000000_secure_auth_rls_soie.sql` (tables `soie_sessions`, `soie_messages`, `soie_feedback`, `soie_events`, `soie_memories` + RLS). The older `ask_*` tables from `20260828000000_ask_mode_schema.sql` are no longer used.

### Model request (current API shape, Claude Opus 5.5)

Adaptive thinking (no `budget_tokens`, no sampling parameters), depth via `output_config.effort`, `tool_choice` left at `auto` (forced tool use is rejected on this model, so the loop enforces `submit_answer` itself: one nudge, a verified best-effort parse of JSON text, then fallback), streaming, all custom tools `strict: true`, `web_search_20260209` (max 4 uses, India/Kolkata), prompt caching (explicit breakpoint on the stable system prompt, top-level automatic breakpoint through the tool loop). `pause_turn` re-sends the assistant turn unchanged; `refusal` and `max_tokens` fall back. We do not set `eager_input_streaming`: it disables the API's input validation and our tool inputs are small.

## Learning, honestly

Nothing "learns" in the model. Two things are real: (1) notes the family saves (`soie_memories`) and (2) the family's recent "not helpful" comments for that patient are included in the AI prompt, quoted, as facts and style preferences. They never override safety rules. The rules engine does not read them. The UI says exactly this.

## Evaluation (`npm run soie:eval`, `npm run soie:wire`, and `/simulation-lab` for admins)

243 cases run real engine code over six synthetic patients (steady, crisis reading, sparse, missed medicines, high-sodium diet, empty) at a fixed "now" (2026-10-04 09:30 IST), with independent oracles for the numbers:

- safety (28 emergency phrasings + 8 non-emergencies, medicine/diagnosis/injection/crisis/remember), temporal (41), normaliser (7), records (7: IST edges, legacy UTC-shifted dose logs, auto-missed), ledger (11: oracles + invariants), rules engine (34 questions in Hindi/Hinglish/English/Devanagari including the old failure modes: "Kal Papa ne kya khaya", "papa" ≠ medicine, "blood" ≠ food, impossible dates, no-data patients);
- verifier (34): fabricated numbers/dates/times/refs/URLs must fail, faithful answers (rounding, derived numbers, tool refs) must pass;
- agent loop + tools (scripted fake model, 35 cases): tools, all results in ONE user message, `pause_turn`, repair, 3 bad submissions → fallback, refusal, nudge, `max_tokens`, API error, timeout, crisis lead, injection removal, memory safety, request shape;
- loaders (in-memory fake Supabase): 2,500 rows past a 1,000-row cap, a server cap below the page size, ceiling flag, IST range edges, defaults, scoping, rate-limit counter.

`/simulation-lab` runs the same suite in the browser and lists real failures. It does **not** call a real model or database.

`npm run soie:wire` drives the **real Anthropic SDK** (via `anthropic-client.ts`) against a local fake Messages API that streams SSE, and asserts the request we send (adaptive thinking, `output_config.effort`, strict tools, `web_search_20260209`, cached system prompt, no `tool_choice`, no sampling parameters) and that streamed `thinking` / `server_tool_use` / `web_search_tool_result` / `tool_use` blocks parse and replay correctly. It cannot prove the live API accepts the request.

## Smoke test with your key

1. Run the migration; set `ANTHROPIC_API_KEY` (and optionally the variables above) in `.env.local`; `npm run dev`; sign in.
2. `npm run soie:eval` and `npm run soie:wire` → both pass (no key needed; Node 22.18+).
3. `/ask` header badge reads "AI + इंटरनेट खोज चालू". Ask: **"आज का हाल बताइए"** (engine badge "AI", evidence chips open real records), **"पिछले 7 दिन का औसत BP क्या रहा?"** (compare with `/health`), **"BP कम रखने के लिए खाने में क्या बदलाव करें?"** (badge "AI + इंटरनेट", sources with links, recommendations by kind/basis), **"papa ko seene mein dard hai"** (red emergency card, no model call), **"dawai band kar du kya"** (no instruction, doctor banner), **"yaad rakho ki papa ko doodh se allergy hai"** (appears under "सेव की गई बातें").
4. As admin, open the trace panel under an answer: `cacheReadTokens` should be > 0 from the second question on; `failure` stays empty. A 400 from the API shows as `api_error status=400` plus the "AI से जवाब नहीं मिल पाया" notice (rules answer shown), so a misconfiguration is visible, not silent.
5. Set `SOIE_RATE_LIMIT_PER_HOUR=2` and ask 3 questions to see the 429 message; remove the key to see the rules-engine notice.

## Known limits

- The AI path and the Supabase loaders are verified by tests against fakes and by reading the SDK types and docs; they were not exercised against the live API or database. First live run may surface request-shape surprises (strict schema acceptance, `cache_control`, `output_config`); they fall back visibly.
- History is the last 120 IST days (a hard ceiling of 20,000 rows per table, flagged if hit). "Last year" questions are answered with that stated limit.
- Inactive medicines count only on days with a real log (their stop date is not stored). Medicine logs written by older app versions with a UTC-shifted time are re-aligned by matching the schedule.
- Averages are over *logged* days only, and say so; sodium is a lower bound when items lack sodium data; "oil/fried" is counted by food name.
- The rules engine has no internet and no open-ended advice; for advice questions it says so and shows the data plus rule-based suggestions.
- The UI was type-checked and linted but not rendered in a browser in the build environment.
