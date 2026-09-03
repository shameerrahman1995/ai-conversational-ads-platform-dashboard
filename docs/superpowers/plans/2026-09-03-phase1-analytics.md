# Phase 1 — Analytics (P1.N) Implementation Plan

**Goal:** Append-only event ingestion + a north-star funnel with creative/agent-version dimensions.

**Architecture:** `AnalyticsModule`. `funnel.ts` is pure (FUNNEL_STAGES + computeFunnel: per-stage counts + step conversion, dimension filtering). `AnalyticsService.track` appends immutable `Event` rows; `funnel` aggregates org-scoped events. Org-scoped.

**Spec:** design doc §1 (north-star funnel) / §13 (events).

## Tasks
- **T1** `funnel.ts` (FUNNEL_STAGES, computeFunnel) + tests.
- **T2** `AnalyticsService` (track / funnel) + tests.
- **T3** `AnalyticsController` (`POST /v1/events` = creator, `GET /v1/analytics/funnel` = analyst) + DTO + module.

## Acceptance
- Events appended immutably + org-scoped; funnel counts per stage with step conversion; filter by creativeVariantId / agentVersion.
- 5 unit tests (87 total); build/typecheck/test green; API boots.
