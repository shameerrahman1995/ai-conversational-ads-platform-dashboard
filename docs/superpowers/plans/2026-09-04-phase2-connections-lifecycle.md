# Phase 2 (part 2) — Connections & Connector Lifecycle

**Goal:** Manage ad-platform connections through their full lifecycle: authorize → connect → test → rotate → reauth (on 401) → revoke, enforcing the connector state machine.

**Architecture:** Connector state machine added to `@acp/shared-types` (`CONNECTOR_TRANSITIONS` + `canTransitionConnector`). The ad-connector registry moved into a global `AdConnectorsModule` (shared by Publishing + Connections). `ConnectionsService` upserts a `Connection`, drives status via guarded transitions, and stores provider credentials only as a `secretRef` reference (never raw). Org-scoped + audited.

**Spec:** design doc §8 (connector lifecycle) / §14 / §17 (secrets).

## Tasks
- **T1** `@acp/shared-types`: `CONNECTOR_TRANSITIONS` + `canTransitionConnector` + test.
- **T2** `AdConnectorsModule` (global registry); refactor `PublishingModule` to consume it.
- **T3** `ConnectionsService` (startAuthorization, completeAuthorization, list, test, rotate, markReauthRequired, disconnect) with guarded transitions + test.
- **T4** `ConnectionsController` (`/v1/connections`: list=creator; authorize/rotate/reauth/disconnect=admin; test=creator) + DTO + module.

## Acceptance
- Lifecycle enforced: DISCONNECTED→AUTHORIZING→CONNECTED→(DEGRADED|REAUTH_REQUIRED)→REVOKED; invalid jumps rejected.
- test() degrades on failure / recovers from DEGRADED; reauth models 401 handling; disconnect revokes + clears secretRef.
- Tokens stored as secretRef only; org-scoped + RBAC + audited.
- 8 unit tests (125 total); build/typecheck/test green; API boots.

## Remaining (Phase 2)
CRM/calendar connection flows, real OAuth redirect handling, creative-rejection loop, spend/performance import, live Google/Meta adapters.
