# AI Conversational Ads Platform — Design & Phased Delivery Plan

- **Status:** Approved for scaffolding (Phase 1 foundation)
- **Date:** 2026-09-03
- **Source:** `ai-conversational-ads-platform-blueprint.pdf` (24-page product & technical plan)
- **Product position:** Turn a product page (website / PDF / feed / brand brief) into compliant cross-platform ads plus a 24/7 post-click AI sales agent, then send qualified leads and revenue signals to the customer's CRM.
- **North-star metric:** cost per **qualified lead** (not CTR). Funnel: impression → click → agent start → meaningful conversation → consented lead → qualified lead → meeting → revenue.
- **MVP assumptions:** multi-tenant SaaS; advertisers connect their own ad + CRM accounts; the platform does **not** resell media in the MVP.

---

## 1. Architectural decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Frontend | Next.js (App Router, TypeScript, Tailwind) | Blueprint default; SSR + admin UI; component system |
| Backend | NestJS **modular monolith** (TypeScript) | Unified TS, shared types, OpenAPI-generated client, single hiring profile |
| Workers | Node + BullMQ (Redis) — separate from day one | Durable queue + idempotency + DLQ + backoff (blueprint mandate) |
| Repo | Monorepo (pnpm + Turborepo) | Shared contracts across web/api/workers |
| Root | The existing `ai-conversational-ads-platform-dashboard/` folder | User choice |
| Data | PostgreSQL (Prisma), Redis, S3-compatible object storage (MinIO locally) | Blueprint default; Prisma for MVP velocity + migrations |
| AI | Provider-neutral model gateway (Anthropic first) + vector index | Adapters so providers/speech swap behind one interface |
| Agent runtime | A **module inside `api`** for MVP, structured to extract later | Blueprint: extract high-load services only when scale/isolation requires |

### 1.1 Monorepo layout

```
ai-conversational-ads-platform-dashboard/         ← monorepo root
├── apps/
│   ├── web/            Next.js dashboard — 9 areas: Home, Campaigns, Creative
│   │                   Studio, Agents, Publishing, Leads, Analytics, Connections, Admin
│   ├── api/            NestJS modular monolith — 10 modules (identity, ingestion,
│   │                   campaign-intel, creative, agent-runtime, lead, publishing,
│   │                   integration-hub, analytics, policy)
│   └── workers/        Node/BullMQ workers: render, publish, ingestion, crm-sync
├── packages/
│   ├── shared-types/   Domain types + DTOs (single source of truth)
│   ├── api-client/     Typed client SDK generated from the API's OpenAPI contract
│   ├── connectors/     Ad-platform connector contract + adapters (google, meta, …)
│   ├── crm/            Canonical lead schema + CRM/calendar adapters
│   ├── policy/         Claims / spec / region validation (used by api + workers)
│   ├── ui/             Shared design-system components
│   └── config/         Env schema (zod), logging, constants
├── db/                 Prisma schema + migrations (PostgreSQL, tenant-scoped)
├── infra/              docker-compose for local dev (Postgres, Redis, MinIO); IaC later
├── docs/superpowers/specs/   design docs
├── turbo.json · pnpm-workspace.yaml · package.json
```

### 1.2 Two-runtime principle

Ad-network creative stays **deterministic, lightweight, and policy-safe**. All live model calls, microphone access, long conversations, appointment booking, and CRM writes live in the **hosted post-click agent**. Native platform lead forms are a second, lower-friction capture route.

Lead paths: `Ad → hosted agent` (default) · `Ad → native form` · `HTML5 playable` (app installs) · `Standard landing page` (fallback).

---

## 2. Backend modules (the 10 logical boundaries)

Kept as modules in the monolith + workers; extract only under load.

| Module | Responsibilities | Interface |
|---|---|---|
| Identity & tenancy | Orgs, users, invitations, SSO, RBAC, audit | REST + auth middleware |
| Source ingestion | Crawl URLs, parse docs, extract product facts, brand assets | Async job + status API |
| Campaign intelligence | Brief, offers, copy, audience, experiment hypotheses | Versioned generation API |
| Creative rendering | Templates, layout, HTML5 packaging, image/video render, validation | Job queue + artifact manifest |
| Agent runtime | Session state, retrieval, tools, guardrails, streaming | WebSocket/SSE + REST fallback |
| Lead management | Consent, schema validation, dedupe, score, ownership, deletion | Transactional REST + events |
| Publishing | Provider adapters, remote object map, idempotency, review polling | Command API + connector workers |
| Integration hub | CRM/calendar adapters, field mapping, delivery, replay | Webhook receiver + worker |
| Analytics | Event ingestion, spend import, funnel, attribution, experiments | Append-only events + warehouse |
| Policy | Tech specs, claims checks, industry/region rules, approval gates | Synchronous validation API |

---

## 3. Data model

Core tables (each business record carries `organization_id`):
`organizations, users, connections, campaigns, creative_variants, publish_jobs, agent_configs, conversations, leads`.

Additional tables:
`assets, source_documents, knowledge_chunks, campaign_versions, approvals, platform_accounts, remote_objects, agent_versions, messages, lead_field_values, consent_records, crm_mappings, delivery_attempts, events, experiments, audit_events`.

**Data rules:** tenant isolation in app + RLS where practical · provider tokens only in a secrets manager (rows hold references + non-secret metadata) · immutable versions for approved creative/agent/prompt/disclosure/publish snapshots · separate retention/redaction for messages + PII · remote-object mapping preserves provider/account/campaign/ad IDs, revision, review status, last sync cursor.

---

## 4. API & events

**API standards:** org-scoped authz, cursor pagination, request IDs, structured errors, explicit versions · `Idempotency-Key` required on publish/lead/booking/CRM-write · webhook receivers verify signatures, persist raw metadata, return fast, process async · never expose provider tokens to browsers · short-lived signed upload URLs · OpenAPI contract → generated typed client.

**Representative endpoints:** `POST /v1/sources`, `POST /v1/campaigns`, `POST /v1/campaigns/{id}/generate`, `POST /v1/variants/{id}/render`, `POST /v1/agents/{id}/evaluate`, `POST /v1/publish-plans` + `/approve`, `POST /v1/agent-sessions`, `POST /v1/leads`, `POST /v1/connections/{provider}/oauth/start`, `POST /v1/webhooks/{provider}`, `GET /v1/analytics/funnel`.

**Key events:** `campaign.version_approved`, `creative.rendered`, `publish.requested`, `platform.review_changed`, `agent.session_started`, `lead.captured`, `lead.qualified`, `crm.stage_changed`.

**Job guarantees:** at-least-once + idempotent consumers (no exactly-once claims across external APIs) · unique op key prevents duplicate ads/leads/appointments/CRM records · per-org/account/endpoint rate limits · replayable DLQ · saga compensations only when safe — never auto-delete a live remote campaign on a later failure.

---

## 5. Cross-cutting workstreams (run through every phase)

- **`SEC` Security/Privacy/Compliance** — RBAC + org scoping + object-level authz + audit; managed vault + envelope encryption + key rotation; WAF/rate-limits/CSRF/SAST/DAST; signed uploads + malware scan + sandboxed render; generated-HTML5 template allowlist + CSP + isolated iframe; PII encryption/masking/retention/deletion; AI grounding + prompt-injection boundaries + tool authorization; publishing approval separation + immutable snapshot + least-privilege OAuth. **Restricted verticals** (healthcare, finance, employment, housing, legal, politics, age-restricted) delay automated publishing and need dedicated policy packs.
- **`REL` Reliability/Observability** — targets: hosted agent 99.9%/mo; agent first response p95 < 3s (text); no acknowledged lead without durable storage; lead→CRM p95 < 2 min; publish acknowledged after durable enqueue; render p95 < 5 min; documented RPO/RTO + quarterly restore; 100% audit of publish/permission/deletion/export/secrets actions. Sanitized telemetry dims only — never log raw tokens/message content/PII/source text.
- **`DX` DevEx/CI-CD** — trunk-based dev, preview envs, migrations, canary rollout, feature flags; CI = lint/typecheck/test/build.

---

## 6. Phased delivery plan

### Phase 0 — Discovery *(3–4 wks)*
**Goal:** validate demand before building connectors/channels. **Exit:** 3 design partners + agreed qualified-lead definition.
- **P0.1** 10–15 customer interviews; map current ad→lead→CRM funnel; recruit 3 design partners.
- **P0.2** Write shared north-star funnel + "qualified lead" contract with partners.
- **P0.3** Platform access investigation — Google Ads / Meta dev access, quotas, review timelines; capability matrix.
- **P0.4** Click-through prototype of the 6-step wizard + agent preview (no backend).
- **P0.5** Compliance scoping — restricted verticals, consent/disclosure, data residency.

### Phase 1 — Private MVP *(10–12 wks)*
**Goal:** one source → brief → exports → hosted chat agent → lead inbox → CRM. **Exit:** first live campaigns; reliable lead capture & delivery.

**Foundation (wks 1–2)**
- **P1.F1** Scaffold monorepo (pnpm+Turborepo), `web`/`api`/`workers`, shared packages, docker-compose (PG/Redis/MinIO). *(this session)*
- **P1.F2** `DX` CI (lint/typecheck/test/build), preview envs, trunk-based flow, migrations pipeline.
- **P1.F3** Core DB schema (core + version/approval/audit tables) via Prisma.
- **P1.F4** `SEC` Baseline: secrets vault wiring, env schema, signed upload URLs, RBAC middleware, audit-event spine.

**Tenant & access** — P1.A1 org/user + invitations · P1.A2 roles (creator/reviewer/publisher/analyst/admin) · P1.A3 org-scoped authz + isolation tests · P1.A4 audit trail. *(AC: isolation tests pass; roles enforced)*

**Product ingestion** — P1.I1 URL/PDF/feed upload + signed URLs + malware scan · P1.I2 async parse/OCR + status API · P1.I3 fact extraction + human fact-approval UI · P1.I4 source deletion. *(AC: parse status visible; approved facts drive generation)*

**Knowledge (RAG)** — P1.K1 chunk-by-meaning + metadata + embed + index · P1.K2 hybrid retrieval + citations + staleness expiry.

**Campaign generation** — P1.C1 versioned brief/offer/copy from *approved* facts · P1.C2 source-linked claims panel + "Needs verification" · P1.C3 regenerate single field only (no silent live edits).

**Creative output (exports)** — P1.R1 template DSL + render worker · P1.R2 1:1 / 4:5 / 9:16 images + video storyboard · P1.R3 Google display set · P1.R4 validation manifest + safe-zone preview · P1.R5 generic export (ZIP/MP4/PNG + manifest + click URL).

**Hosted chat agent** — P1.G1 agent builder (identity/knowledge/conversation/tools/data/evaluation tabs) + AI disclosure · P1.G2 runtime: session state, retrieval, streaming (WS/SSE), guardrails, PII redaction, prompt-injection isolation · P1.G3 qualifying questions + consent capture · P1.G4 fallback (FAQ/form-only/human) + circuit breaker · P1.G5 evaluation harness (golden Qs, groundedness, extraction, latency/cost) with publish thresholds · P1.G6 provider-neutral model gateway. *(AC: grounded answers, consent, mobile perf, thresholds before publish)*

**Lead inbox** — P1.L1 canonical lead schema + field-level source · P1.L2 consent/disclosure records (separate consent types) · P1.L3 dedupe + score + owner + status · P1.L4 transcript view (facts vs. model summary) · P1.L5 suppress/delete/merge/replay + delivery timeline.

**CRM delivery** — P1.M1 outbox + connector queue · P1.M2 HubSpot **or** Zoho adapter + generic webhook · P1.M3 field mapping + type/required validation + test mode · P1.M4 retry/replay + remote-ID + idempotency keys. *(AC: mapping, test, retry, replay, remote ID)*

**Analytics (seed)** — P1.N1 append-only event pipeline (click→agent-start→conversation→consented→qualified) · P1.N2 funnel view with creative & agent-version dimensions.

**Security/Reliability** — P1.S1 threat model + upload scan + deletion/export workflow + pen-test prep · P1.O1 structured logging (sanitized dims), health checks, SLO scaffolding.

### Phase 2 — Publishing beta *(8–10 wks)*
**Goal:** direct publishing to Google + Meta with safe approval. **Exit:** ≥10 advertisers publish repeatedly.
- **P2.1** Connector framework — 12-method contract + per-account capabilities registry.
- **P2.2** Google Ads connector — OAuth, account hierarchy, assets/campaigns/ads, HTML5 bundle rules (600 KB), review/status polling.
- **P2.3** Meta connector — business assets, pages/identities, campaigns/creatives, native lead retrieval, insights.
- **P2.4** Publish control plane — immutable snapshot + preview diff; approval separation; command API + connector workers; idempotency; remote-object map; review webhooks/poll.
- **P2.5** Creative-rejection loop — explain → clone → fix → resubmit, preserving rejected remote ID + evidence.
- **P2.6** Connections UI — authorize/scope/test/rotate/disconnect; lifecycle states; 401 handling + idempotent resume.
- **P2.7** Spend/performance import — provider vs. internal metrics shown separately.
- **P2.8** HubSpot + Zoho complete + CRM stage/revenue feedback (`crm.stage_changed`).
- **P2.9** `SEC` — least-privilege scopes, remote-action audit, capability contract tests, provider version monitoring.

### Phase 3 — Optimization *(8–12 wks)*
**Goal:** measurably improve the funnel. **Exit:** demonstrated lift vs. existing funnel.
- **P3.1** Creative variants + experiment plan model + assignment.
- **P3.2** Agent A/B testing — versioned configs/prompts, traffic split, per-version metrics.
- **P3.3** Qualified-lead feedback loop — optimize to *accepted lead*, not clicks.
- **P3.4** Calendar booking — Google + Microsoft 365 (narrow scopes, hold/confirm, timezone, external event ID).
- **P3.5** Human handoff — live escalation + routing + transcript context.
- **P3.6** Attribution & analytics — cohort, documented attribution windows, cost-per-qualified-lead, downstream value, experiment reporting.
- **P3.7** Cost controls — per-tenant/session budgets, model tiering, caching, early qualification, usage alerts.

### Phase 4 — Expansion *(quarterly, demand-gated)*
**Goal:** add channels/formats only when demand covers maintenance. **Exit:** connector demand supports cost.
- **P4.1** TikTok connector (video/image → playable later) + TikTok CRM routes.
- **P4.2** HTML5 / playable compiler — template allowlist, CSP, static analysis, isolated preview iframe, per-network specs.
- **P4.3** Microsoft / Amazon DSP / LinkedIn export/connector profiles + spec validation.
- **P4.4** Voice & avatar — mic/recording consent, streaming STT→agent→TTS, interruption/silence handling; avatar as presentation layer + audio-only fallback (no deceptive impersonation).
- **P4.5** Scale extraction — pull agent-runtime / rendering / publishing into own services if load requires.
- **P4.6** Restricted-vertical policy packs.

---

## 7. Advertising-platform connector contract

`authorize()` `listAccounts()` `capabilities()` `validate()` `uploadAssets()` `createDraft()` `publish()` `getReviewStatus()` `pause()` `fetchMetrics()` `fetchLeads()` `revoke()`

Each connector exposes a **capabilities document** by account, objective, region, and placement. The UI must only promise formats the connected account can actually use. MVP connector order: **generic export → Google Ads → Meta → TikTok → Microsoft/Amazon/LinkedIn**.

---

## 8. Frontend information architecture

One workspace, 9 areas: **Home** (alerts/funnel/activity), **Campaigns** (list/wizard/approvals/experiments), **Creative Studio** (concepts/variants/resize/validation), **Agents** (builder/knowledge/tools/simulator/transcripts), **Publishing** (account map/campaign tree/review/errors), **Leads** (inbox/transcript/score/consent/CRM status), **Analytics** (funnel/cohort/attribution/experiments), **Connections** (ad networks/CRM/calendar/webhooks), **Admin** (org/members/roles/billing/security/audit).

**Global rules:** always show org + advertiser context (prevent wrong-account publishing) · persistent Draft/In review/Approved/Live/Paused status · separate "Save draft" from "Publish" (publish opens a review screen) · every AI claim shows source or "Needs verification" · role-based actions.

**Lifecycles:** Campaign `DRAFT → GENERATED → VALIDATION_FAILED | READY_FOR_REVIEW → APPROVED → SCHEDULED → PUBLISHING → IN_REVIEW → LIVE → PAUSED | REJECTED | ARCHIVED`. Connector `DISCONNECTED → AUTHORIZING → CONNECTED → DEGRADED → REAUTH_REQUIRED → REVOKED`. **Publishing safety:** UI sends an immutable publish snapshot; post-approval changes create a new version requiring re-approval — regenerated AI copy never silently modifies a live campaign.

---

## 9. Execution model (Claude Code)

| Blueprint role | Mechanism |
|---|---|
| Senior full-stack (tenancy/workflow) | `feature-dev:code-architect` + `code-explorer`; `frontend-design` skill |
| Backend/integration (connectors/data) | `code-architect`; `general-purpose` agents; `context7` MCP for docs |
| AI engineer (ingestion/agents/evals) | `agent-sdk-dev` + `claude-api` skills; provider-neutral gateway |
| Product designer | `frontend-design` + `design` skills |
| Security/privacy | `security-review` + `code-review` skills |

**Per-workstream loop:** `brainstorming` (if non-trivial) → `writing-plans` → `test-driven-development` → `executing-plans` / `subagent-driven-development` → `requesting-code-review` + `security-review` → `verification-before-completion`. Parallel-safe work → `dispatching-parallel-agents` / git worktrees; heavy fan-outs → `Workflow` tool (confirm cost first).

---

## 10. MVP acceptance criteria (Phase 1 gate)

Tenant isolation tests · URL/PDF parse + fact approval + source deletion · versioned brief with source-linked claims + single-field regenerate · 1:1/4:5/9:16 creative + Google display set + validation manifest · grounded chat agent with consent + fallback + mobile perf · lead inbox with structured fields/transcript/score/attribution/owner/status · CRM delivery (webhook + HubSpot or Zoho) with mapping/test/retry/replay/remote ID · publishing one platform e2e with preview/approval/idempotency/review-status/pause · funnel analytics with creative + agent-version dims · security: threat model, secrets vault, upload scan, pen-test, deletion/export.

**Not in first release:** media-buying recommendations, auto budget changes, arbitrary user JS, every CRM/ad platform, real-time avatar, multi-touch attribution, white-labeling, reseller billing, regulated-industry automation.

---

## 11. Risk register (top items)

| Risk | Mitigation |
|---|---|
| Platform API/format changes | Capability registry, generic exports, contract tests, feature flags, version monitoring |
| Incorrect generated claim | Source-backed facts, prohibited-claim rules, human approval, immutable published version |
| Agent captures sensitive data | Field allowlist, real-time redaction, explicit consent, retention controls, restricted verticals |
| Duplicate ads/leads | Idempotency keys, remote mappings, dedupe evidence, replay-safe jobs |
| AI/voice cost > revenue | Per-tenant/session budgets, smaller models, caching, early qualification, usage alerts |
| Low-quality leads | Qualification templates, CAPTCHA/native verification, CRM feedback, optimize to accepted lead |
| Rendering as security boundary | Template DSL, isolated workers, no arbitrary backend code, scanner + CSP |
| Disputed attribution | Show provider vs. internal metrics separately; document windows + model |

**Go / no-go:** Go if partners pay for campaign production + qualified-lead workflow (not novelty) and the hosted agent lifts conversation→qualified-lead rate. Pivot to export + agent + lead-sync first if publishing permissions slow launch.

---

## 12. This session's scope (P1.F1)

Scaffold the monorepo foundation: root config + `git init`; `apps/web` (Next.js 9-area shell + org context + status primitive); `apps/api` (NestJS 10-module skeleton + `/health` + zod config + Swagger); `apps/workers` (BullMQ render queue with idempotency/DLQ/backoff); `packages/*` (shared-types, config, connectors contract, crm canonical schema, policy, ui, api-client); `db/` Prisma core schema; `infra/docker-compose.yml`. **DoD:** installs, typechecks, `web` + `api` build/boot; flag anything needing `pnpm install` if the sandbox blocks it. Commits held until requested.

> This blueprint is suitable for discovery, estimation, architecture review, and MVP scoping. It is **not** a substitute for provider approval, legal advice, privacy review, or the current terms of each connected advertising account. Verify platform capabilities again during implementation.
