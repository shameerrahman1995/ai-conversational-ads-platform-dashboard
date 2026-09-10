# Conversa Ads V9 — Phase 0 Audit & Task Graph (2026-09-11)

Orchestrator: Opus 4.8. Method: read-only package audit + 5 parallel official-doc verification agents (A2). No source modified; no credentials used; no external paid calls.

## 0. What was actually provided vs. what the master prompt assumes
The V9 master prompt is written to convert `Conversa_Ads_Full_Stack_Production_Handoff_V8.zip` (a "dependency-light Node HTTP server" + React `apps/frontend` + docs + infra). **That ZIP was not provided.** What was provided / found:

| Item | Reality |
|---|---|
| V9 prompt pack (zip) | ✅ 5 docs (master prompt, routing matrix, checklist, README) |
| `Conversa_Ads_V8_START_HERE.md`, `..._PACKAGE_INVENTORY.md` | ✅ describe a 181-file V8 package that is **not on disk** |
| `Conversa_Ads_Premium_React_V8_Standalone.html` | ✅ 782 KB single-file demo, **18 modules**, fully self-contained (no CDN/scripts), title "Conversa Ads V8" |
| V8 full-stack source tree (apps/api HTTP server, openapi-v8.json, infra, docs/*) | ❌ **absent** |
| Working dir `converstation_ads/` (where I was launched) | **empty** (only `.remember`) — not a git repo |
| **Sibling `ai-conversational-ads-platform-dashboard/`** | ✅ **real productionized monorepo** (git, pnpm+turbo) — see §1 |

## 1. The real codebase (product of record candidate)
`ai-conversational-ads-platform-dashboard/` — git repo, pnpm@11 + turbo, Node 22. Far **beyond** V8; it has already implemented most of the V9 roadmap.
- **apps/api** (NestJS, Swagger `/docs`) — **21 domain modules**: agent-runtime, analytics, audit-log, auth, campaign-intel, connections, cost, creative, engagement, experiments, identity, ingestion, integration-hub, knowledge, lead, ops, policy, privacy, publishing, retention.
- **apps/web** (Next.js App Router, ~11 route groups: dashboard/admin/agents/analytics/campaigns[+new,+[id]]/connections/creative/leads/login/publishing) — title "ConvoAds AI". **A different, narrower UI than the 18-module V8 standalone.**
- **apps/workers** (render · publish · ingestion · crm-sync).
- **db** (`@acp/db`, Prisma) — **33 models**, **6 migrations** (immutable CampaignVersion/AgentVersion, ConsentRecord, RemoteObject, PublishJob, DeliveryAttempt, Experiment/Arm, AuditEvent, AdSession, UsageRecord…).
- **packages/**: api-client, config, connectors, crm, jobs, policy, shared-types, ui.
- infra/docker-compose (Postgres/Redis/MinIO), .github CI, Dockerfiles, run-local.sh.
- **Its own `docs/PRODUCTION-READINESS-AUDIT.md`** (2026-09-05) documents 3 completed remediation waves + open items.
- **Uncommitted WIP right now** (14 files, +1045/-8): new `google-ads.live.ts` (real Google Ads REST v25 client), creative `compileBundle` (real HTML5 ZIP), publishing adapters (+337), agent-runtime module, prisma schema (+26), shared-types, config env.

## 2. What already works / is real (evidence-based)
- Tenant scoping (`scopedWhere`), global ValidationPipe, RBAC decorators, audit spine, SSRF-safe fetch, secret-name log redaction, boot-time env validation.
- **Wave 1 (done):** real JWT auth (scrypt), global default-deny guard + `@Public()`, req.user-derived org/role, AsyncLocalStorage request context + `x-request-id`, workers do real work w/ Redis idempotency, DB transactions (lead/publish), **AES-256-GCM PII encryption + retention + DSAR**, env-based provider selection (`PROVIDERS_MODE`) + **real Anthropic Messages adapter**, Dockerfiles + CD + `/health`/`/livez`/`/readyz`, eslint + integration/e2e in CI.
- **Wave 2 (done):** throttler, helmet + CORS allowlist, global exception filter, gated Swagger, graceful shutdown, live-data UI (audit/consent/transcript/publish/deltas), responsive drawer + modal focus trap.
- **Wave 3 (done):** worker DLQ ops, org-scoped idempotency uniques, FE route resilience (error/not-found/loading), responsive grids.
- **HTML5 compiler** forbids external network for no-network platforms; enforces Google 600KB. **Publishing** creates objects **paused/disabled by default**. **Voice** = STT→same guardrailed text runtime→TTS, consent-layered.

## 3. What is mock / stubbed / incomplete (honest labels)
- **stub/mock:** all external integrations bound `useClass: Stub*` by default — ad-platform connectors (except new google-ads.live WIP), CRM (HubSpot/Zoho/Salesforce), **STT/TTS (voice)**, image generation, multi-format renderer, embeddings+vector retrieval (brute-force cosine, no pgvector), calendar, malware scanner.
- **open / credential-gated (from repo audit):** Postgres **RLS** + `orgId` on 6 child tables; **pgvector**; real **OAuth apps + secrets vault**; live ad-platform/CRM/STT-TTS/image/renderer adapters; managed Postgres backups/PITR; connection pooling; JSON-column validation/versioning; soft-delete for consent/audit; **AST-based HTML5 sanitizer** (current regex static-analysis is bypassable; preview CSP uses `unsafe-inline`); a11y keyboard/ARIA, theming, i18n, skeletons.
- **testing gap:** ~190 API unit tests use hand-mocked Prisma; **no integration/E2E/frontend** tests; source-parser fabricates fallback facts on fetch failure (must fail/retry in prod).

## 4. Official documentation verified (2026-09-11) — see platform-verification/*
| Provider | Version | Decisive verified fact |
|---|---|---|
| Google Ads | v25/v25.1 | Uploaded HTML5 display **supported but gated** (MediaBundle, ≤600KB/40 files, **no external network**, **no mic**, **no live-AI**); paused-at-creation ✅. Dev-token **sunset 2026-09-09** → re-verify onboarding. |
| Meta | v26.0 | **No arbitrary HTML** in Feed/Reels; Playable = App-Installs-only self-contained; Lead Ads + click-to-message **supported (gated)**; paused-creatable ✅. |
| TikTok | v1.3 | Playable self-contained — **"must not make any HTTP requests"**; Instant Form lead gen supported; born-paused **allowlist-only** (else create-then-status-update). |
| Browser | — | Mic/voice/external-fetch in cross-origin ad iframe all need **publisher-controlled** Permissions-Policy + sandbox + CSP; **not self-grantable**; live in-ad voice not achievable by default. |
| OpenAI/Gemini | live | Support is **model-specific**; OpenAI reasoning models **reject** temperature/top_p (400) → strip pre-flight, use reasoning_effort; Gemini thinking split (2.5 thinkingBudget vs 3.x thinkingLevel); prompt caching (OpenAI auto); Realtime no special access. |

**Governing conclusion:** a **live conversational/voice AI cannot run inside a served ad creative** on Google/Meta/TikTok. It belongs on a **direct-publisher / first-party post-click surface**. Ad platforms get native supported formats + honest fallbacks. The codebase already reflects this.

## 5. Risk register (top)
| ID | Risk | Sev | Mitigation |
|---|---|---|---|
| R1 | Ambiguous target: launched in empty dir; real repo is a sibling with uncommitted WIP | High | **Confirm product-of-record + commit WIP to safety branch before any edit** |
| R2 | Two frontends (V8 standalone 18 modules vs Next web ~11) — "preserve interface" ambiguous | High | Decide canonical UI; reconcile standalone's extra modules into it (don't replace) |
| R3 | Overclaiming platform capability (mic/live-AI/arbitrary-HTML) | High | Verified matrix + fail-closed; already largely enforced |
| R4 | google-ads.live claims a "validated end-to-end smoke test" — unverified live claim + dev-token sunset | Med | Label `implemented-local` until sandbox re-verified with real creds; re-check onboarding |
| R5 | No RLS / orgId on 6 child tables → tenant-escape depth | Med | RLS + Prisma middleware (no creds needed) |
| R6 | Regex HTML5 static-analysis bypassable; preview CSP `unsafe-inline` | Med | AST/sanitizer allowlist |
| R7 | No integration/E2E tests; unit tests mock Prisma | Med | Testcontainers + Playwright in CI |
| R8 | Editing a live git repo with uncommitted WIP | Med | Branch + commit WIP first; work on feature branch |

## 6. Task graph (Phase 1 candidates, no external credentials required)
Gated on the §Decision. If product-of-record = `-dashboard`:
1. **A18/A0:** commit WIP to safety branch; run `pnpm i` → `pnpm build` → `pnpm typecheck` → `pnpm test`; record exact results (the real "run the stack" step).
2. **A7/A8:** Postgres RLS + `orgId` on child tables + Prisma tenant middleware (migration up/down + tenant-escape tests).
3. **A9:** pgvector retrieval (replace brute-force cosine) — migration + retrieval precision tests.
4. **A12/A8:** AST-based HTML5 sanitizer replacing regex; tighten preview CSP — golden/invalid-package + secret-scanner tests.
5. **A10:** provider capability registry hardening (encode §4 param rules; strip unsupported pre-flight) — unit tests per (provider,model).
6. **A1/A4/A5:** reconcile the 18-module V8 standalone IA against Next `apps/web`; inventory missing modules; a11y pass.
All of the above need **no real credentials/paid calls** and keep the repo runnable. Live OAuth/ad-platform/CRM (Phases 7–9) are deferred until real credentials + approvals are supplied (explicit user gate).
