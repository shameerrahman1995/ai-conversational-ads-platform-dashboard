# ConvoAds AI — Production Readiness Audit

**Date:** 2026-09-05
**Method:** Read-only audit across 6 dimensions (security, data, async/integrations, frontend/UX, observability/ops, testing/compliance).
**Scope:** the full monorepo on `main` (`apps/{api,web,workers}`, `packages/*`, `db`).

## Verdict

The platform is **architecturally production-shaped but not production-ready**. The
seams are right — tenant scoping (`scopedWhere`), RBAC decorators, an audit spine,
a genuinely solid SSRF-guarded fetch, secret-reference indirection, provider ports
with stubs, schema with consent/region/retention columns. But the **load-bearing
implementations behind those seams are stubs or absent**: there is no real
authentication, every external integration is a hardcoded stub, the background
workers do no real work, and there is no deployment, at-rest encryption, or
integration/E2E testing.

**Do not deploy as-is.** In any non-`production` `NODE_ENV` the API is fully
spoofable (any caller can set `x-user-role: admin` + any `x-org-id` → cross-tenant
takeover); in `production` every guarded route returns 503.

---

## P0 — Blockers (must fix before ANY real deployment)

1. **No real authentication.** Identity comes from client `x-org-id`/`x-user-role`
   headers; `assertDevAuthAllowed()` only fails closed when `NODE_ENV` is exactly
   `'production'`. No login/session/JWT/OAuth; the web app hardcodes the user and
   uses a dev role switcher. → Real authN (session/JWT/SSO) populating `req.user`
   server-side; org + roles derived from the verified principal, never headers.
   Register auth/tenant guards globally (default-deny + `@Public()`), not per-controller.
   *(security, frontend, compliance)*

2. **Every external integration is a stubbed, hardcoded adapter.** Model gateway,
   all ad-platform connectors, CRM (HubSpot/Zoho/Salesforce/webhook), STT/TTS,
   image generation, the multi-format renderer, embeddings + vector retrieval,
   calendar, and the malware scanner are all bound `useClass: Stub*` with no
   env-based swap. The product performs no real external work. → Provider-selection
   via DI/env, real adapters (SDK + auth + retries/backoff + webhooks), and a
   boot assertion that no stub is active in production. *(async/integrations)*

3. **Background workers do nothing.** `apps/workers/src/handlers.ts` only logs and
   returns `{ok:true}`; the real services are never invoked. Idempotency is a
   process-local in-memory `Set` (re-runs side effects on restart / across replicas).
   Parse + CRM delivery actually run synchronously in the API, so 3 of 4 queues have
   no producers. → Wire handlers to real services (Nest standalone context), a shared
   durable idempotency store (Redis `SETNX`/DB unique), DLQ drain + alerting.
   *(async, ops)*

4. **No transactions — multi-write operations are non-atomic.** Zero `$transaction`
   usage. Lead create (lead + field values + consents), lead merge, delivery, and
   publish→campaign-status are separate writes; a mid-sequence failure corrupts state
   (lead with no consent, delivered lead with no `crmId`). → Wrap each multi-write
   unit in `prisma.$transaction`, including the audit write. *(data)*

5. **No encryption at rest + no retention/DSAR for PII.** `LeadFieldValue.value`
   (email/phone/name) and `Message.contentRef` (transcript text) are plaintext.
   `redactedAt`/`expiresAt` columns exist but nothing sets or sweeps them. No
   data-subject export/erasure. For lead handling in restricted verticals this is a
   legal blocker. → Field-level (envelope/KMS) encryption for PII, scheduled
   retention/redaction sweeps, and DSAR export/erasure across Conversation/Message/Lead.
   *(compliance, data)*

6. **No deployment path + health check is a stub.** No Dockerfiles for api/web/workers,
   no CD (CI only builds/tests), no IaC; `infra/docker-compose.yml` is local-dev
   (Postgres/Redis/MinIO) with no app tier and no `acp-assets` bucket. `/health`
   returns static `{status:'ok'}` and never checks DB/Redis. → Multi-stage non-root
   Dockerfiles, a CD pipeline (image build/push + `migrate deploy` + deploy),
   `/livez` + `/readyz` (DB `SELECT 1`, Redis `PING`, S3), Next `output:'standalone'`.
   *(ops, data)*

7. **No integration / E2E / frontend tests; no lint or coverage gates.** ~190 API
   unit tests all use hand-mocked Prisma (`as any`) — controllers, the ValidationPipe,
   DI, real DB queries, and the entire web app are untested. No eslint config or lint
   script anywhere; CI runs build→typecheck→test only. → HTTP-level tests vs an
   ephemeral Postgres (Testcontainers/supertest), Playwright E2E for critical flows,
   an eslint gate, and coverage thresholds in CI. *(testing)*

---

## P1 — High (required for a trustworthy, safe launch)

**Security & platform**
- No rate limiting / throttling anywhere (visitor chat + voice-turn + all mutations open to abuse & LLM cost-exhaustion). Add `@nestjs/throttler` (per-IP/session/org).
- No security headers (helmet) and permissive `app.enableCors()` (reflects all origins). Add helmet + CSP + a CORS allowlist.
- Swagger `/docs` exposed unconditionally, incl. production. Gate by env or auth.
- Secrets vault is a stub (`secret::provider::id`); OAuth is a fake `auth.example.com` URL; adapters pass `secretRef:''`. Wire a real secrets manager + OAuth authorize/callback/exchange + rotation before storing real tokens.
- Visitor-facing agent/voice endpoints trust client-chosen `x-org-id` (drives that tenant's LLM/voice spend). Issue server-signed, budget-scoped embed session tokens.
- Env schema missing every provider credential (only `ANTHROPIC_API_KEY` + S3). Add validated, prod-required env for each provider + webhook signing secrets.

**Data & tenancy**
- Tenant isolation is application-only and opt-in — no Postgres RLS, no Prisma middleware, and 6 child tables (`Message`, `LeadFieldValue`, `ConsentRecord`, `DeliveryAttempt`, `CampaignVersion`, `AgentVersion`) have no `orgId`. Add RLS + a client extension injecting `orgId` (defense in depth).
- Audit trail omits the actor (only 2 of ~37 `audit.record` calls pass `actorId`), is mutable, has no retrieval/export endpoint, and is written outside the mutation's transaction. Thread actor from request, make it append-only/tamper-evident, add a query/export API, write it in-transaction.
- No automated migration application or drift gate in CI/deploy.

**Observability & ops**
- No error tracking, no global Nest exception filter, no `unhandledRejection`/`uncaughtException` handlers.
- No metrics or tracing (no Prometheus/OTEL); no request logging or correlation/trace IDs propagated api→workers.
- API has no graceful shutdown (`enableShutdownHooks` not called → Prisma disconnect never fires on SIGTERM).

**Frontend & compliance-sensitive UI**
- Desktop-only: the 244px sidebar never collapses; no mobile/tablet layout; topbar overflows.
- Fabricated data shown as real: lead **consent chips + transcripts**, admin **audit log** + org profile + "immutable audit log" claim, agent **Publish** fake-success, Overview trend deltas. Bind to real data or clearly mark as sample. (Consent/transcript misrepresentation is a legal risk.)
- Modals have no focus trap/restore; global search is decorative and the notifications bell is dead; several dead action buttons (Overview/Analytics/LeadDetail).
- Model gateway needs a real Anthropic adapter with streaming (for the voice loop), retries, timeouts, and cost metering.
- Object storage bucket not provisioned; S3 config optional (silent broken presigns); real malware scanner needed before file ingestion.

**Compliance**
- AI disclosure is only a system-prompt instruction, never structurally enforced/returned. Consent capture has gaps (Boolean-only at session start; voice-recording consent only recorded if a lead already exists). No cookie consent / privacy / ToS pages; no CCPA opt-out. Data residency (`Organization.region`) declared but not enforced.
- No frontend tests, no API-client contract tests, no load/perf tests for the real-time voice/chat hot path.

---

## P2 — Medium / P3 — Low (hardening & polish)

- **Data:** missing FK indexes (`PublishJob.variantId`, `CreativeVariant.assetId`, `Approval.campaignVersionId`, `Booking.conversationId`, `Handoff.conversationId`); idempotency uniques not org-scoped; `RemoteObject` has no unique tuple (non-idempotent sync); hard-delete cascades destroy consent/audit evidence; load-bearing JSON columns unvalidated/unversioned; no connection pooling/readiness; no committed seed; no backups/PITR.
- **Async/ops:** worker topology (one process, default concurrency, no per-queue scaling, unbounded retained failures); no `LOG_LEVEL`; log redaction is key-name only (value-level PII in free-text slips through); CI omits lint + integration DB + image/dependency scanning; web not deploy-ready (`output:'standalone'`, health route).
- **Frontend:** refetch blanks the page (no stale-while-revalidate/query cache); backdrop-click discards filled forms; no `error.tsx`/`not-found.tsx`/`loading.tsx`; tabs lack full ARIA keyboard pattern; no theming/dark mode; spinners not skeletons; no favicon/OG/per-page titles; no i18n; error toasts should be `assertive`; dead new-campaign modal in `campaigns/page.tsx`.
- **Integrations:** STT/TTS, image gen, renderer, embeddings (brute-force cosine over all chunks — needs pgvector), calendar, copy/fact-extraction are stubs; the source-parser **fabricates fallback facts** on fetch failure (remove in prod — fail/retry instead).
- **HTML5 creative safety:** regex-based static analysis is bypassable and the preview CSP allows `unsafe-inline`; replace with an AST/sanitizer allowlist.

---

## Suggested remediation roadmap

**Phase 1 — Make it safe & deployable (P0):** real auth + global guards; env-based provider selection + the 2–3 integrations you actually launch with (model gateway, one ad platform, one CRM); real worker execution + durable idempotency; transactions; PII encryption + retention/DSAR; Dockerfiles + CD + readiness probes; integration/E2E tests + lint/coverage gates.

**Phase 2 — Trustworthy launch (P1):** rate limiting, helmet/CORS, secrets vault + OAuth, RLS + audit actor/export, error tracking + metrics + tracing + correlation IDs, graceful shutdown, responsive UI, replace fabricated UI with live data, privacy/consent surfaces.

**Phase 3 — Hardening & scale (P2/P3):** indexes + JSON validation + backups, pgvector retrieval, worker scaling + DLQ tooling, a11y/theming/skeletons/error boundaries, remaining real integrations, HTML5 sanitizer.

## What's genuinely solid (keep)
Consistent `scopedWhere` tenant scoping; global `ValidationPipe({transform,whitelist})`;
the SSRF-safe fetch (DNS-rebinding-safe connect-time lookup, redirect re-validation,
size/time caps); secret-name log redaction; boot-time env validation; the audit
data model; provider ports/stubs architecture; the eval-gated agent publish design;
restricted-vertical policy packs; broad unit coverage of service/guard/policy logic.

---

## Remediation status (branch `feat/prod-hardening`, PR #28)

**Wave 1 — P0 (done):** real JWT auth (scrypt passwords, `/v1/auth/login` + `/me`),
global default-deny `JwtAuthGuard` (`@Public()` opt-out), `req.user`-derived org/role;
AsyncLocalStorage request context → audit actor + `x-request-id` correlation; workers
do real work (Nest app context) with Redis-backed idempotency; DB transactions in
lead + publish writes; AES-256-GCM PII field encryption + retention + DSAR
export/erase + audit read/CSV export (formula-injection-safe); env-based provider
selection (`PROVIDERS_MODE`) with a real Anthropic Messages adapter; Dockerfiles +
CD + `/health`/`/livez`/`/readyz`; eslint + integration/e2e tests in CI.

**Wave 2 — P1 (done):** rate limiting (throttler), helmet + CORS allowlist, global
exception filter, gated Swagger, graceful shutdown; replaced fabricated UI with live
endpoints (admin audit, lead consent/transcript, agent publish, overview deltas,
analytics actions); responsive drawer + modal focus trap.

**Wave 3 — P2/P3 (done):** worker DLQ ops (`OpsModule`: job counts / failed list /
retry, admin-only); org-scoped idempotency uniques (`PublishJob`, `DeliveryAttempt`
+ `orgId`); frontend route resilience (`error`/`global-error`/`not-found`/`loading`);
responsive grid helpers replacing non-collapsing inline layouts.

**Still open (infra/credential-gated — not fabricated here):** Postgres RLS
enforcement + `orgId` on remaining child tables; pgvector retrieval; real OAuth apps
+ a secrets vault; live ad-platform / CRM / STT-TTS / image / renderer / calendar
adapters; managed Postgres with backups/PITR; connection pooling; JSON-column schema
validation/versioning; soft-delete for consent/audit evidence; AST-based HTML5
creative sanitizer; a11y keyboard/ARIA completion, theming, i18n, skeleton loaders.
