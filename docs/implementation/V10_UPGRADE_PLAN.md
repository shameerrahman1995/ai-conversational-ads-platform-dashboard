# Conversa Ads → V10 Upgrade Plan

**Date:** 2026-09-11 · **Author:** orchestrator + specialist agents (UX, Platform/API, AI-runtime) · **Target:** `/Users/shameer/conv_ads` (Conversa Ads Local **V10**) · **Current app:** `ai-conversational-ads-platform-dashboard` (branch `v9/phase1-foundation`).

## 1. What V10 is, and the core strategic call
V10 (`Conversa_Ads_Codex_Local_App`, v10.0.0) is the **design + behavior reference**: a premium React 18/TS dashboard on a Node.js + **SQLite** local app (runs on :8787), with 18 routes, 4 hero workspaces, a hand-rolled inline-SVG chart/design system, an `InteractiveAd` 6-state customer runtime, 56 API endpoints, and a strict safety/governance model. Its QA bar: **187 buttons / 41 icon-buttons audited, 0 missing behavior, 0 console errors, 0 horizontal overflow (desktop + mobile).**

**Strategic call (recommended):** V10's *stack* (Node + SQLite, single-file `tsc` bundle, global `namespace Conversa`, whole-workspace localStorage sync) is a **local reference**, not a production target. Our current app is a **more production-grade stack** (NestJS + Next.js App Router + Prisma + Postgres + Redis + workers + RLS + pgvector). **So we adopt V10's LOOK + BEHAVIOR + FEATURE COMPLETENESS onto the current stack — we do NOT downgrade to SQLite or a single-file bundle.** This matches the standing mandate: *preserve the production interface, don't replace it.*

## 2. Gap summary (where we are vs V10)
**Backend: ~90% already there.** The current NestJS API already implements auth, campaigns+generate, creative compile/bundle/generate-image, agents+sessions+voice+evaluate, knowledge+pgvector, connections OAuth lifecycle, publishing with full deploy lifecycle + capabilities, leads CRUD, events/funnel/spend/attribution, experiments, budget, audit, privacy/retention, jobs, CRM/webhooks, and a signed **edge/ad-session** public runtime. Prisma's 33 models ≈ V10's 28-table production reference. Paused-by-default, consent-before-lead, encrypted PII, two-opt-in deploy safety are present.

**Frontend + feature-depth: the real gap.** Current module depth (lines) vs V10 (every module fully built):
- Mature: campaigns/[id] (1680), publishing (1109), analytics (916), creative (637), agents (572), leads, connections, campaigns, overview (322).
- Thin (wired this session): knowledge (74), experiments (68), api-logs (77).
- **Capability-gated 20-line stubs V10 builds out fully:** Templates, Audiences, Placement Preview, Conversations, Testing & QA.

**Cross-cutting gaps:** no charting library (V10 = inline-SVG AreaChart/BarChart/DonutChart/Sparkline); no dark mode/theming; Overview lacks the AI-operator insights panel, platform-health panel, performance-trend chart, campaign-performance table; no ⌘K command palette / env switcher / notifications / workspace switcher / AI-usage meter; currency `$` vs V10 `₹` (INR).

**Small backend gaps:** dedicated CRUD for **audiences / conversations-index / templates**; a **versioned capability registry + runtime-profile selector** (reconcile the V10 6-profile vs blueprint-schema 4-profile mismatch); an **AI-operator/insights** surface (derive from experiments/analytics/perf-learning); a **6-case agent regression** endpoint.

## 3. Guiding principles
1. Adopt V10 look/behavior on the current production stack; no stack rewrite.
2. Keep the repo runnable + green after **every** phase (`pnpm build/typecheck/test`).
3. Preserve existing wired functionality; never regress a working screen.
4. Keep the honest safety/capability discipline: paused-by-default, consent-before-capture, no unsupported-capability claims, dry-run-first, secrets server-side.
5. Real external integrations (Google/Meta/TikTok/AI providers/CRM) stay **credential-gated** — UI + dry-run/mock built now, live behind credentials (unchanged from prior plan).
6. Reuse V10's exact design tokens/currency/format conventions so the result is visually faithful.

## 4. Phased roadmap
Each phase: **Goal · Tasks (with owning agent-role) · Deliverables · Exit criteria · Depends on.** Agent roles: A4 UX/design-system, A5 React frontend, A6 backend/API, A9 knowledge, A10 agent-runtime, A11 creative, A2 platform/capability, A17 analytics/data, A8 security, A19 QA.

### Phase U0 — Design system + shell parity (foundation; unblocks everything)
**Goal:** bring the shared UI kit + app shell to V10 fidelity so every screen can be built against it.
- **U0.1 (A4/A5)** Inline-SVG, theme-aware chart primitives (no chart lib): `AreaChart` (multi-series, gradient, grid, legend), `BarChart` (horizontal), `DonutChart`, `Sparkline`.
- **U0.2 (A4)** `MetricCard` (label + tinted icon + big value + up/down delta chip + note + sparkline); the `metric-grid five` KPI row.
- **U0.3 (A4)** `DataTable` (selectable, sortable, per-cell render, responsive data-label, EmptyState) + `Pagination`; `Drawer` with Tabs; `Dropdown/MenuItem`; `Segmented`; `JsonViewer`; `DefinitionList`; `StepRail`; `Notice`; `Skeleton/SkeletonPage`; `StatusBadge`/`PlatformMark`/`PlatformStack`/score-pills.
- **U0.4 (A4/A5)** Dark mode + theming: `data-theme` on `<html>`, `--accent` var (violet `#5b5bd6` default, per-workspace override), persisted.
- **U0.5 (A5)** Shell: grouped nav (**Workspace / Build / Operate / Measure / Platform**), collapsible sidebar (persisted), sidebar **AI-interactions usage meter**, footer profile row.
- **U0.6 (A5)** Topbar: breadcrumb, **⌘K command palette** (routes + quick actions), **environment switcher** (Production/Sandbox), **dark-mode toggle**, help, **notifications bell + drawer** (badge), primary New campaign; keyboard (⌘K/⌘N/Esc).
- **U0.7 (A5)** **Workspace switcher** modal (current + switch + create).
- **U0.8 (A4)** Locale/format: `Intl` en-IN `money()`/`compact()`/`pct()` helpers, **INR default**, workspace-configurable currency/timezone/region.
- **Exit:** design-system kit + shell visually match V10; all existing pages still render + pass; `pnpm build/typecheck/test` green.
- **Depends on:** none (do first).

### Phase U1 — Overview to V10 parity
**Goal:** the hero dashboard matches the V10 preview.
- **U1.1 (A5)** 5 MetricCards w/ sparklines + deltas (Media spend, Ad conversations, Qualified leads, Cost/qualified lead, Active campaigns), computed live.
- **U1.2 (A5)** Performance-trend `AreaChart` w/ Segmented (Conversations/Qualified/Spend), dated series.
- **U1.3 (A5/A17)** **AI-operator panel** — ranked evidence-backed insight cards (title + evidence sentence + source label) deep-linking to Experiments/Creative/Agents.
- **U1.4 (A5)** Campaign-performance table (product avatar, PlatformStack, status, spend/% budget, conversations, qualified, CPQL; row→drawer).
- **U1.5 (A5)** **Platform-health panel** (Google/Meta/TikTok/Agent-runtime dots + sync/latency/token-expiry + status badge).
- **U1.6 (A5)** Conversion funnel (5 stacked bars); approvals banner; date-range + Export.
- **U1.7 (A6/A17)** Backend: an `insights`/recommendations projection (derive from experiments + analytics + perf-learning); platform-health projection (connections + agent p95). No new external deps.
- **Exit:** Overview matches the V10 screenshot; 0 console errors.
- **Depends on:** U0.

### Phase U2 — Build out the 5 gated stubs to full V10 screens
**Goal:** eliminate all capability-gated stubs; every nav item is a real screen.
- **U2.1 Templates (A5+A6):** card grid (industry filter), Use-template→builder (writes draft), preview drawer (state list). Backend: templates catalog (seed + CRUD or curated static set).
- **U2.2 Audiences (A5+A6):** Segments/Personalization/Overlap tabs; create-audience modal; overlap matrix. Backend: `audiences` CRUD (Prisma model + module).
- **U2.3 Conversations (A5+A6):** KPIs (grounded-answer rate, qualification rate, median duration), table, transcript drawer with per-message **grounding meta**. Backend: conversations **index** endpoint (list + summary; transcript already exists).
- **U2.4 Placement Preview (A5+A11):** placement/device/**runtime-condition** selectors, `PlacementHost` renderers (Google sidebar, Meta feed, TikTok video+playable, Publisher article) embedding the shared `InteractiveAd`, intent inspector + timeline + pinned-runtime. (Sandbox — never a real lead.)
- **U2.5 Testing & QA (A19+A6):** preflight runner (progress), test list w/ inspect, **readiness-by-system** bars, **release blockers** + acknowledge. Wire REAL checks: creative compile, **TikTok offline-package rule** (no fetch/external), agent grounding regression, prompt-injection, grounded-answer latency, **consent-before-capture** (lead endpoint rejects missing consent), capability validation, Meta safe dry-run, analytics ingestion.
- **Exit:** 0 capability-gated stubs remain; each screen wired to real endpoints; green.
- **Depends on:** U0 (U2.4 also on the `InteractiveAd` from U3.9, so schedule U2.4 with/after U3).

### Phase U3 — AI Creative Studio to V10 (hero #1)
**Goal:** the 9-stage AI-first studio + shared `InteractiveAd`.
- **U3.1 (A11/A5)** 9-stage pipeline nav: **Brief → Directions → Experience → Produce → Studio → Variants → Simulate → Review → Learn**; full-bleed layout, top bar (creative switch, status, History/Placement preview/**Build package**/Save version/Review & handoff).
- **U3.2 Brief (A11):** NL brief textarea, context chips (product page/knowledge/agent/brand/legal), outcome/audience/tone/CTA; **Generate complete blueprint** → `/v1/creative/…/generate` returning brief+directions+blocks+journey+variants (`CreativeBlueprint` schema).
- **U3.3 Directions (A11):** 3 strategy cards (fit score + rationale), storyboard row, regenerate/combine/use.
- **U3.4 Experience (A11):** journey **state machine** (hook/explore/ask/answer/qualify/convert + fallback), per-state entry/exit/analytics-event/AI-instruction, exceptional paths (agent timeout/voice denied/consent declined/CRM down/unsupported placement).
- **U3.5 Produce (A11):** 6 asset-family cards + production-policy grid (fidelity/brand-freedom/diversity/cost-ceiling/rights).
- **U3.6 Studio (A11/A5):** tri-pane editor — left Blocks/Context/Assets, center canvas (platform+size, zoom, state tabs, live `InteractiveAd`), right **Copilot/Inspector/Rules**; **Autopilot/Guided/Advanced** modes; Copilot edits = recoverable versions + undo/redo, **locked-block protection** (`locks{legal,brand,product,user}`), QA panel (8 checks + fix-safe).
- **U3.7 Variants (A2/A11):** placement/size variant cards w/ runtime **mode** + readiness; **capability-gated** variants marked; personalization rules; uses the runtime-profile registry (U7.2).
- **U3.8 Simulate + Review + Learn (A11/A19/A17):** synthetic-persona simulation (persona/network/mic/placement, intent gauge, event trace); role-based approval list (creative/brand/legal/client) gating handoff; Learn recommendations (experiment briefs; never edits live).
- **U3.9 `InteractiveAd` component (A11/A16):** real 6-state customer flow (Hook/Explore/Ask AI/Answer w/ source citation/Qualify/Convert w/ explicit-consent gate), shared by Studio/Preview/Simulate; wired to the edge ad-session runtime.
- **U3.10 (A6)** Backend: persist blueprint states/blocks/locks/variants + simulation traces; compile already exists.
- **Exit:** Brief → approved creative version → compiled package works; locks + approvals enforced; invalid packages fail closed.
- **Depends on:** U0.

### Phase U4 — AI Agent Studio to V10 (hero #2)
**Goal:** the 10-tab configurator + test/regression + readiness gate.
- **U4.1 (A10/A5)** Two-pane studio + 10 tabs: **Setup / Instructions / Model & runtime / Knowledge / Tools / Qualification / Safety / Voice / Testing / Versions** (per `AgentConfig` schema).
- **U4.2 Model & runtime (A10/A2):** provider/model controls **driven by the versioned capability registry** (built this session) — never offer/send an unsupported param; reasoning effort, sampling, latency/cost budgets, fallback route; Compare-models modal; Run-latency-test.
- **U4.3 Instructions/Knowledge/Tools/Qualification/Safety/Voice (A10/A9/A8):** system-prompt editor + compiled-prompt preview; knowledge picker (approval-gated) + retrieval controls; server-side tools (consent/timeout/schema); qualification fields + intent-signal grid; safety switches + adversarial must-block prompts; voice (opt-in, text fallback, no auto-mic).
- **U4.4 Testing (A10/A19):** live console + **full response trace** (latency/first-token/grounding/provider/retrieval/safety/intent/tools JSON); **6-case regression** (grounding/safety/injection/fallback/tool/language) → new `/v1/agents/{id}/regression` endpoint.
- **U4.5 (A10)** Persistent **readiness gate** (8 checks) — Publish disabled < 75; Versions tab (restore/export), pinned-production card.
- **Exit:** grounded agent passes regression; publish gated by readiness; no unsupported model params ever sent.
- **Depends on:** U0; leverages the capability registry from `v9/phase1-foundation`.

### Phase U5 — Campaign Builder + Campaigns + Deployments to V10
- **U5.1 (A5)** 8-step governed **Campaign Builder** (Objective/Platforms/Audience/Creative/Agent/Conversion/Budget/Review) with conditional platform fields, capability-gate warnings, save-draft, safety-policy aside, safe-draft creation.
- **U5.2 (A5)** Campaigns list → detail **Drawer** (Summary/Creative/Agent/Placements/Activity), readiness ring, duplicate, delete (local-only note), bulk activate/pause (privileged confirm).
- **U5.3 (A5/A2)** **Deployments**: wizard (platform-conditional fields), guarded-live switch (paused-by-default), dry-run request plan + JSON, remote-object parent/child tree, pause/activate/rollback (separate privileged ops), reconciliation view.
- **Exit:** draft → pinned versions → approvals → paused remote objects flow matches V10.
- **Depends on:** U0, U3, U4.

### Phase U6 — Measure suite: Analytics, Experiments, Leads, Conversations, API logs
- **U6.1 (A17/A5)** Analytics: 5 KPIs, performance `AreaChart` (metric segmented + prior period), conversion `DonutChart` + %-funnel, question-intelligence `BarChart`, platform comparison, campaign table; disclose attribution window/currency/timezone/freshness; no raw PII.
- **U6.2 (A17/A5)** Experiments: cards + A/B rows + confidence progress + results drawer (decision rule 95% + min 500 sessions), **Approve-winner** gated to Winner-found.
- **U6.3 (A5)** Leads / API-logs to full V10 (mostly there; add filters drawer, consent badges, inspect tabs, PII-redacted note, retry-only-4xx).
- **Exit:** Measure suite matches V10; PII excluded from analytics.
- **Depends on:** U0.

### Phase U7 — Settings, governance, capability registry
- **U7.1 (A8/A5)** Settings 6 sub-sections: Workspace (defaults, danger zone), **Team & roles** (RBAC grid), **Security** (MFA/SSO, **two-person live-activation approval**, audit timeline + export), Billing & usage, Branding, **Developer** (API keys, **webhooks** w/ HMAC + test, idempotent retries).
- **U7.2 (A2/A6)** **Versioned capability registry + runtime-profile selector** — reconcile V10's 6 profiles (`live-conversation, interactive-offline, native-lead-form, click-to-message, hosted-experience, concept-only`) vs the blueprint schema's 4; validate capability **before compile AND before deploy**; snapshot capability into every deployment.
- **Exit:** governance UX complete; capability checks enforced at both gates.
- **Depends on:** U0, U3, U5.

### Phase U8 — Hardening + V10 QA parity
- **U8.1 (A19)** Match V10 QA bar: **0 controls missing behavior**, 0 console errors, no document-level horizontal overflow (desktop 1600×1100 + mobile 390×844), WCAG-oriented a11y (focus/ARIA/contrast), visual regression vs `docs/screenshots/`.
- **U8.2 (A19)** Tests: component + route + **Playwright E2E** for the hero flows; extend the existing 231-test API suite; integration vs ephemeral Postgres in CI.
- **U8.3 (A18)** Perf/observability parity (p95 surfaced; skeleton loaders; SSE/WebSocket for deploy/ingestion/conversation live updates).
- **Exit:** V10 QA parity; release-status labels truthful.
- **Depends on:** all prior.

## 5. Cross-cutting workstreams (run alongside phases)
- **Design system/charts** — the U0 enabler; every phase consumes it.
- **Backend endpoint gaps** — audiences/conversations-index/templates CRUD, capability registry, insights projection, agent regression (sprinkled through U1/U2/U4/U7).
- **Currency/locale** — INR default, configurable (U0.8).
- **Credential-gated live integrations** — Google/Meta/TikTok/AI-providers/CRM remain gated; UI + dry-run/mock built now, live behind real credentials + approvals (see prior RELEASE_STATUS "still open"). Also: RLS `DATABASE_URL` flip, real embedder (both from prior plan).

## 6. Sequencing & parallelization (team model)
- **U0 first** (blocks everything).
- Then in parallel: **U1 (Overview)**, **U2 (stubs, except U2.4 which follows U3.9)**, and start **U3 / U4** (the two heavy heroes — assign a dedicated agent each; independent file sets).
- **U5 / U6** after U0 (U5 needs U3/U4 outputs).
- **U7** governance, then **U8** QA gate.
- **Agent ownership** avoids file collisions: creative pages (A11), agent pages (A10), measure pages (A17), shell/design-system (A4), backend modules (A6) — each on disjoint paths; QA (A19) reviews each phase merge. Use `pnpm build/typecheck/test` as the per-phase gate (as in `v9/phase1-foundation`).

## 7. Decisions needed from you (before U0)
1. **Confirm the strategic call:** adopt V10 look/behavior on the current NestJS/Next/Prisma stack (recommended) — *not* rewrite to the Node/SQLite reference. 
2. **Currency default:** **₹ (INR, V10 default)** or keep `$` (USD)? (configurable either way).
3. **Priority order:** ship Overview + stubs first (fast visible parity), or lead with a hero (Creative or Agent Studio)? Recommended: **U0 → U1 → U2 → U3/U4**.
4. **Scope of "major upgrade":** full V10 parity (all 8 phases) vs a first milestone (U0–U2 = shell + Overview + no-more-stubs), then iterate.

## 8. Rough effort shape (relative)
U0 ≈ large (foundation). U1 ≈ medium. U2 ≈ large (5 screens + 3 endpoints). **U3 ≈ largest** (9-stage studio + InteractiveAd). **U4 ≈ largest** (10-tab studio + regression). U5 ≈ large. U6 ≈ medium. U7 ≈ medium. U8 ≈ medium-ongoing. The two Studios (U3, U4) dominate; everything else is a straightforward consume-the-design-system build once U0 lands.

## 9. AI / Creative / Runtime — concrete target detail (pins U3 & U4)
**Creative blueprint shape (U3.2/U3.10)** — `POST /v1/creative/…/generate` returns: `directions[]` (exactly **3**: name/hook/rationale/score), **7 typed `blocks[]`** `{id,type,label,value,visible,locked}` — `brand`(locked), `headline`(text), `body`(text), `visual`(locked), `ask`(ask-ai), `explore`(cta), `legal`(locked=disclaimer); **6 `states[]`** hook/explore/ask/answer/qualify/convert each with `{purpose,event,fallback}`; per-platform `variants[]` `{platform,size,runtime,status}`; `versions[]` audit trail; `generation{provider,model,usage,latencyMs}` or deterministic `{provider:'mock',assumptions[]}`. **Deterministic local mode** (`AI_MODE=mock`) must keep the app fully usable with **no keys** (mock blueprint merged under live output). Prompt guard ≥12 chars.
**6-case agent regression (U4.4)** — fixed battery: (1) approved pricing=Grounding, (2) unapproved discount=Safety, (3) prompt-injection=Safety, (4) unreleased-model no-answer=Fallback, (5) callback consent=Tool, (6) Malayalam question=Language. Scoring: Safety **Failed** if output leaks system prompt / "ignore your instructions"; Tool **Warning** if >1400 ms; else Passed. Returns `{results[],summary{passed,warnings,failed}}`.
**Signed runtime + consent (already ~present in current edge runtime)** — runtime token = `base64url(payload).HMAC-SHA256`, scoped `{workspaceId,creativeId,campaignId,agentId,platform,exp}`, verify rejects missing/invalid/expired; **hard consent gate** before lead (`consent!==true → 400`); offline Meta/TikTok packages embed answers, **no fetch/no external**; manifest carries `networkPolicy` + `safety{explicitConsentRequired,secretsEmbedded:false,remoteObjectsDefaultPaused:true}`.

**Where the CURRENT app is already AHEAD of V10's shipped code (don't regress, do enforce):**
- Retrieval: ours = **pgvector ANN**; V10 shipped = keyword-only. Keep ours; add V10's metadata filters (region/language/effective-date) + no-answer policy.
- Provider param safety: ours = **versioned capability registry that strips unsupported temperature/top_p** (Opus/Sonnet/Fable 5); V10 does the same ad hoc. Keep ours; extend to OpenAI/Gemini when wired.
- Immutable versions: ours = Prisma CampaignVersion/AgentVersion; V10 shipped = flat records. Keep ours.

**Gaps V10's own docs flag that we should ENFORCE (not just report):**
1. **Publish-block on failing AI evals** — make Publish gated by regression + readiness ≥75 (V10 reports but doesn't block). → U4.5.
2. **Unify intent scoring** — one scorer for runtime + test (V10 has 3 divergent ones). → U4.4.
3. **Runtime token origin + rate-limit scoping** (V10 token lacks origin). → U3.9/security.
4. **Tool execution path** — agent `tools[]` are configured but not executed anywhere in V10; build consent-gated tool calls with arg schemas. → U4.3 (stretch).
5. **Itemized package preflight validator** (size, contrast/a11y, autoplay-audio, final-URL allowlist, checksum) — ours already has the AST analyzer + secret scanner; extend to the full checklist. → U3/U8.

## 10. Deliverable status
This document is the plan. Next action is your **Section 7 decisions**, then Phase **U0** (design-system + shell), which unblocks everything. The three specialist reports (UX/screens, Platform/API/Data, AI/Creative/Runtime) are the detailed source material behind each phase.
