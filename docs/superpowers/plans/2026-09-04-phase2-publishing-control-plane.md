# Phase 2 (part 1) — Publishing Control Plane & Connector Framework

**Goal:** Publish approved creative to ad platforms through the uniform connector contract, with immutable snapshots, approval separation, remote-object mapping, and review-status sync.

**Architecture:** `PublishingModule`. Ad connectors (Google Ads, Meta, generic export) implement the `@acp/connectors` 12-method `AdConnector` contract as deterministic stubs behind `ConnectorRegistry`; real OAuth/API calls swap in later. `PublishService` control plane: `createPlan` (validate via connector + capabilities → immutable `PublishJob` at READY_FOR_REVIEW, snapshot = latest CampaignVersion) → `approvePlan` (separate publisher actor → records an `Approval`, enqueues via `JobsProducer.enqueuePublish`) → `executePublish` (connector createDraft + publish → `RemoteObject` map → IN_REVIEW) → `syncReviewStatus` (approved→LIVE / rejected→REJECTED) → `pause`. Org-scoped + RBAC + audited; never auto-deletes a live remote campaign.

**Spec:** design doc §8 (lifecycle + publishing safety) / §14 (connector design).

## Tasks
- **T1** Ad-connector stubs (Google/Meta/GenericExport, base) + `ConnectorRegistry` + capabilities per platform + tests.
- **T2** Schema: `PublishJob.accountId`; regenerate client + migration.
- **T3** `PublishService` (capabilities, createPlan, approvePlan, executePublish, syncReviewStatus, pause, listPlans) + tests.
- **T4** `PublishingController` (`/v1/publish/capabilities`, `/v1/publish-plans` [list/create=creator], `:id/approve|execute|sync|pause`=publisher) + DTO + module.

## Acceptance
- Capabilities per account/platform (Google HTML5 600 KB, Meta carousel + native lead forms).
- Immutable plan (READY_FOR_REVIEW) → publisher-only approval (separation) → enqueue → execute → RemoteObject + IN_REVIEW → LIVE/REJECTED on sync.
- Invalid creative rejected at plan time; all queries org-scoped + audited.
- 9 unit tests (117 total); build/typecheck/test green; API boots.

## Remaining (Phase 2 follow-ons)
Real Google/Meta OAuth + API calls (need credentials), creative-rejection clone/resubmit loop, connections UI (authorize/scope/rotate), spend/performance import, and wiring the publish worker handler to call `executePublish` via the standalone-context seam.
