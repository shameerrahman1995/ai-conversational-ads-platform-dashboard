# Release Status — truthful capability labels

Labels: `mock` · `implemented-local` · `sandbox-tested` · `capability-gated` · `production-verified` · `unsupported`. As of 2026-09-11 nothing is `production-verified` or `sandbox-tested` (no real credentials/accounts exercised this session).

| Area | Status | Notes |
|---|---|---|
| Auth / RBAC / tenant scoping | implemented-local | Real JWT + global default-deny guard; **`orgId` now on all tenant child tables + app-level scoping (this session)**; RLS policies validated + staged (needs dedicated non-superuser role — see RLS_TENANCY.md) |
| PII encryption / retention / DSAR | implemented-local | AES-256-GCM field crypto + retention + DSAR export/erase |
| Anthropic model gateway | implemented-local | Real Messages adapter; **param capability registry now strips unsupported sampling params** (this session) |
| OpenAI / Gemini gateways | unsupported | Not wired; capability rules verified & documented for when they are added |
| Voice (STT/TTS) | mock | Consent-layered pipeline present; STT/TTS are stubs; text is source of truth; opt-in only |
| Knowledge retrieval | implemented-local (mock embeddings) | Brute-force cosine; pgvector open |
| HTML5 creative compiler | implemented-local | Forbids external network for no-network platforms; Google 600 KB enforced; AST sanitizer still open (regex today) |
| Google Ads publishing | implemented-local | `google-ads.live.ts` (REST v25) builds paused DISPLAY upload ad; **not** sandbox-verified here; dev-token sunset caveat |
| Meta / TikTok publishing | mock | Stub adapters; native formats + honest fallbacks per verified matrix |
| Direct-publisher live runtime | implemented-local | Edge ad-session + creative-token guard (WIP); host-cooperative model |
| CRM delivery / webhooks / experiments | implemented-local / mock | CRM adapters stubbed |
| Analytics / events | implemented-local | AdSession + event dedupe migration (WIP) |
| Observability / deploy | implemented-local | Dockerfiles + CD + health/livez/readyz; backups/PITR open |

## Build/test gate (2026-09-11, branch `v9/phase1-foundation`)
- `pnpm build` 12/12 ✓ · `pnpm typecheck` 21/21 ✓ · `pnpm test` 14/14 tasks ✓ (219 API + 6 web tests).
