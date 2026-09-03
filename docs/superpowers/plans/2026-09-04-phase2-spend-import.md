# Phase 2 (part 4) — Spend / Performance Import

**Goal:** Import provider spend/performance metrics via the connector and surface them separately from internal funnel metrics (blueprint §8/§22 — never conflate provider vs. internal numbers).

**Architecture:** New `SpendMetric` model (unique per org+provider+remoteId+day for idempotent upsert). `SpendService.importMetrics` pulls `connector.fetchMetrics` and upserts per row; `getSpend` aggregates org-scoped totals + per-provider breakdown, labeled `source: 'provider'`. Endpoints live in the analytics module alongside (but distinct from) the internal funnel. Org-scoped + audited.

**Spec:** design doc §8 / §22 (attribution — show provider vs. internal separately).

## Tasks
- **T1** Schema: `SpendMetric` (+ unique) ; regenerate client + migration.
- **T2** `SpendService` (importMetrics idempotent upsert, getSpend aggregation) + tests.
- **T3** Wire into `AnalyticsModule`; `POST /v1/analytics/spend/import` + `GET /v1/analytics/spend` (analyst).

## Acceptance
- Import is idempotent per remote object per day; getSpend returns totals + byProvider tagged `source:'provider'`.
- Filter by provider + date range; org-scoped + audited.
- 3 new tests (131 total); build/typecheck/test green; API boots.
