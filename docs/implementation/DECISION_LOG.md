# Decision Log — V9 Orchestration

| # | Date | Decision | Rationale | Owner |
|---|---|---|---|---|
| D1 | 2026-09-11 | **Product of record = this monorepo** (`ai-conversational-ads-platform-dashboard`), not the empty `converstation_ads/` dir or the (absent) V8 full-stack ZIP. | The V8 "dependency-light" package was never provided; this monorepo already implements most of the V9 roadmap and is what "preserve existing functionality" refers to. User-confirmed. | User + A0 |
| D2 | 2026-09-11 | **Canonical frontend = Next.js `apps/web`**; port the V8 standalone's missing modules into it rather than replace it. | The Next app is already wired to the live API; the 782 KB V8 standalone is a broader (18-module) demo used as a design/feature reference. User-confirmed. | User + A0 |
| D3 | 2026-09-11 | **Preserve uncommitted WIP on a dedicated branch** before any edit: `v9/phase1-foundation` (WIP snapshot commit `34cd827`); `feat/prod-hardening` left untouched at `36e5217`. | The repo had significant uncommitted work (google-ads.live, html5 compileBundle, agent edge). Snapshotting first makes it durable and reversible. | A0/A18 |
| D4 | 2026-09-11 | **Live conversational/voice AI is a direct-publisher / first-party-surface capability, never an in-creative capability** on Google/Meta/TikTok. | All three platforms require self-contained creatives with no external network; browsers gate mic/audio/fetch in cross-origin ad iframes behind publisher-controlled Permissions-Policy + sandbox + CSP (verified 2026-09-11). | A2/A16 |
| D5 | 2026-09-11 | **Provider capability registry keyed on (model), fail-closed for unknown models.** Strip unsupported sampling params before every request. | Verified: Claude 5 reasoning models (Opus 5 / Sonnet 5 / Fable 5.1) 400 on temperature/top_p/top_k; only Haiku 4.5 accepts them. The gateway was unconditionally sending `temperature` on the default model. | A10 |

## Deferred decisions (require user / external input)
- Live OAuth apps + secrets vault; real Google/Meta/TikTok/CRM credentials and account approvals (Phases 7–9). **Gated** — needs real credentials / paid actions / business approval.
- Google developer-token onboarding path (dev tokens sunset 2026-09-09) — re-verify live flow before wiring.
