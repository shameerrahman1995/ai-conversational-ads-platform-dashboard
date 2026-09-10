# AI Providers (OpenAI, Gemini) — Official Verification (2026-09-11)

Anthropic handled separately (via claude-api skill at implementation time; a real Anthropic Messages adapter already exists in the codebase). Model rosters churn monthly — treat model IDs as **data**, refresh from live models endpoints; the param/contract rules below are the load-bearing facts.

## OpenAI
- **Surface:** Responses API = recommended primitive (successor to Chat Completions); Chat Completions still fully supported; **Assistants API discontinued 2026-08-26**.
- Streaming ✅; Structured Outputs (strict `json_schema`) ✅; function calling ✅ (newest reasoning models require **Responses** for tools).
- **Sampling (key registry fact):** reasoning models **reject** `temperature`/`top_p`/`logprobs`/penalties with HTTP 400 — must be **stripped pre-flight**; control via `reasoning_effort` (`none…max`, model-dependent). Standard chat models accept `temperature`/`top_p`. → **Support is model-specific.**
- Prompt caching ✅ **automatic** (≥1024 tokens, prefix match). Realtime/voice API ✅ (WebRTC/WebSocket, **no special access**, tier rate-limited).

## Google Gemini
- **Surface:** `generateContent`/`streamGenerateContent`. Model families: GA Gemini 2.5 (pro/flash/flash-lite) + Gemini 3.x; use `GET /v1beta/models` for authoritative list.
- Streaming ✅; structured output via `responseSchema`/`responseJsonSchema` (JSON Schema subset) ✅; function calling `AUTO`/`ANY`/`NONE`/validated ✅.
- **Thinking split (main do-not-send hazard):** Gemini **2.5 → `thinkingConfig.thinkingBudget`** (token budget, model-specific ranges); Gemini **3.x → `thinkingConfig.thinkingLevel`** (`low`/`medium`/`high`). Crossing families errors. `topK`/penalties/`seed` = model-specific — gate per model.

## Capability-registry requirements
1. Key on **(provider, model)**, not provider. Refresh model IDs from live endpoints.
2. Per-model param allowlist/blocklist: `supports_temperature`, `supports_top_p`, `reasoning_control` (`reasoning_effort` | `thinkingBudget` | `thinkingLevel` | none), ranges/enums where known.
3. Feature flags: streaming, structured_output (+ schema flavor), function_calling (+ Responses requirement), prompt_caching (OpenAI automatic), realtime.
4. **Strip unsupported params pre-flight** (OpenAI reasoning rejects with 400; Gemini wrong-family thinking errors) — do not rely on silent ignore.
5. Mark unknowns explicitly (Gemini temp/topP ranges, penalty/seed availability) — "verify per model".

## Sources
- OpenAI: developers.openai.com/api/docs/guides/{migrate-to-responses,text,reasoning,prompt-caching,realtime}, .../docs/models
- Gemini: ai.google.dev/api/generate-content, ai.google.dev/gemini-api/docs/{models,structured-output,function-calling,thinking,changelog}
