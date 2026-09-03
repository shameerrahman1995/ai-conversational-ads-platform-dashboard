# Phase 1 — Workers Live (durable-queue backbone) Implementation Plan

**Goal:** A shared durable-queue contract between the API (producer) and the workers (consumers): typed jobs, idempotency, exponential backoff, DLQ.

**Architecture:** New `@acp/jobs` package = single source of truth for queue names (`render/publish/ingestion/crm-sync`), typed payloads (each carries orgId + idempotencyKey), `defaultJobOptions` (attempts 5, exponential backoff, `removeOnFail:false` = DLQ), and `createQueue`/`createWorker` wrappers. API `JobsModule` (global) provides lazy-Redis-backed queues + a `JobsProducer` (enqueue with `jobId` = idempotency key so BullMQ de-dups) + `POST /v1/sources/:id/parse`. `apps/workers` consumes all four queues via idempotent handlers with completed/failed/error events + graceful shutdown.

**Spec:** design doc §9 (durable queue plane) / §13 (events + at-least-once + idempotent consumers).

## Tasks
- **T1** `@acp/jobs` (queues, payloads, options, createQueue/createWorker) + test.
- **T2** API `JobsModule`/`JobsProducer` (lazy ioredis, dedupe jobId) + `POST /v1/sources/:id/parse` + producer test.
- **T3** `apps/workers` — 4 workers from @acp/jobs + idempotent handlers + events + shutdown + handler tests.

## Acceptance
- API boots WITHOUT Redis (lazyConnect); enqueue routes are RBAC + org-scoped.
- Queue contract: 4 queues, attempts 5, exponential backoff, DLQ retained.
- Producer keys jobs by idempotency; workers de-dup on repeat.
- API 108 tests, jobs 2, workers 2; build/typecheck green.

## Env / remaining seam
Live run needs Redis (`pnpm infra:up`). Worker handlers currently log + are idempotent; the documented integration seam invokes the real services (ParseService/CreativeService/DeliveryService/publish) via a Nest standalone context — wired when Redis + shared runtime land.
