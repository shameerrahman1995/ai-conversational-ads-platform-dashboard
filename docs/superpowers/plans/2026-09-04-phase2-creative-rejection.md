# Phase 2 (part 3) — Creative-Rejection Loop

**Goal:** Recover from a rejected publish per blueprint §8: capture the reason → clone the variant → resubmit as a new plan, preserving the rejected plan + remote id + reason as evidence.

**Architecture:** `PublishService.syncReviewStatus` now persists the rejection reason on `PublishJob.reviewReason` when a review comes back rejected. `PublishService.resubmit` clones the rejected variant (a fresh `CreativeVariant` to fix), creates a new publish plan for it, and leaves the rejected `PublishJob` + `RemoteObject` untouched (evidence). Org-scoped + audited.

**Spec:** design doc §8 (creative-rejection journey + publishing safety).

## Tasks
- **T1** Schema: `PublishJob.reviewReason`; regenerate client + migration.
- **T2** `syncReviewStatus` stores the reason on rejection + audits `publish.rejected`.
- **T3** `resubmit(orgId, planId)`: clone variant → new plan, preserve rejected evidence + tests.
- **T4** `POST /v1/publish-plans/:id/resubmit` (creator).

## Acceptance
- Rejected review stores the reason; `resubmit` clones the variant + creates a new plan and returns the preserved rejected remote id + reason.
- Only REJECTED plans can be resubmitted; the rejected plan/remote object are never deleted.
- 3 new tests (128 total); build/typecheck/test green; API boots.
