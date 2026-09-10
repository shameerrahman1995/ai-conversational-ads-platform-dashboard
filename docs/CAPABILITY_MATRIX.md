# Conversa Ads — Verified Capability Matrix (Phase 0, 2026-09-11)

Status labels: `supported` · `capability-gated` · `unsupported` · `stub/mock` (local only) · `unknown`.
All platform rows verified against current official docs on 2026-09-11 (see platform-verification/*).

## The governing conclusion
**A live conversational / voice AI CANNOT run inside a served ad creative on Google, Meta, or TikTok.** All three require self-contained creatives with no outbound network; browsers additionally gate mic/audio/fetch in cross-origin ad iframes behind publisher-controlled Permissions-Policy + sandbox + CSP that an advertiser cannot self-grant. → The live conversational experience belongs on a **direct-publisher / first-party post-click surface the vendor controls**. Ad platforms receive **native supported formats + honest fallbacks**.

## Platform capability matrix
| Capability | Google Ads | Meta | TikTok | Direct publisher (first-party) |
|---|---|---|---|---|
| Uploaded/arbitrary HTML5 creative | HTML5 display **capability-gated** (MediaBundle, ≤600KB/40 files, self-contained) | Arbitrary HTML **unsupported**; Playable (App-Installs only) **capability-gated** | Playable **capability-gated** (App-Promotion/feed only, self-contained) | **supported** (host-cooperative iframe/tag) |
| External network calls from creative | **unsupported** (native) | **unsupported** in playable | **unsupported** (explicit "no HTTP") | **supported** under host CSP allowlist |
| Microphone / voice in creative | **unsupported** | **unsupported** | **unsupported** | **capability-gated** (user gesture + host Permissions-Policy grant + consent) |
| Live AI dialogue in creative | **unsupported** | **unsupported** | **unsupported** | **supported** (server pipeline) |
| Native lead capture | via forms/site | Lead Ads **supported (gated)** | Instant Form **supported (gated)** | first-party consented lead |
| Click-to-message | — | Messenger/WhatsApp/IG **supported (gated)** | — | — |
| Paused/disabled at creation | **supported** | **supported (option)** | **capability-gated** (allowlist; else create-then-pause) | n/a |
| Current API version | v25 / v25.1 | v26.0 | v1.3 | n/a |

## Honest runtime-profile mapping (matches code: runtime profiles + fallbacks)
- `live-conversation` → **direct publisher only** (host-cooperative). Fallback if voice/host not available: text; then offline FAQ/decision-graph.
- `interactive-offline` → Google HTML5 / Meta·TikTok playable (self-contained, no network, no live AI).
- `native-lead-form` → Meta Lead Ads / TikTok Instant Form.
- `click-to-message` → Meta messaging objectives.
- `hosted-experience` → post-click landing owned by vendor (full live AI possible).
- `concept-only` → preview.

## Codebase alignment (evidence)
- `apps/api/.../creative/html5/static-analysis.ts` already **forbids external network** for no-network platforms and enforces per-network size (Google 600KB). ✅ matches verification.
- `apps/api/.../publishing/connectors/google-ads.live.ts` creates the DISPLAY upload ad **PAUSED**, server-side creds only. ✅ matches (but live-tested claim to be re-verified; developer-token sunset caveat applies).
- Voice = STT → same guardrailed text runtime → TTS, consent-layered, **STT/TTS stubbed**. ✅ honest (opt-in, text source of truth).

## Open verification
- AI providers (OpenAI/Gemini) memo pending (agent running). Anthropic to be confirmed via claude-api skill.
- Google developer-token sunset (2026-09-09) — re-verify live onboarding before wiring real OAuth.
