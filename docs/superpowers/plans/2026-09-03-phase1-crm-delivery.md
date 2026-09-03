# Phase 1 — CRM Delivery (P1.M) Implementation Plan

**Goal:** Deliver leads to a CRM via the connector contract with an outbox, idempotency, field-mapping validation, remote-id capture, and replayable failures.

**Architecture:** `IntegrationHubModule`. CRM adapters (webhook/HubSpot/Zoho) implement the `@acp/crm` `CrmAdapter` contract as deterministic stubs behind `CrmRegistry`; real API I/O swaps in later. `DeliveryService` builds a `CanonicalLead` from the org-scoped lead, validates mappings, and writes `DeliveryAttempt` (unique per provider+idempotencyKey) — accepted attempts are idempotent, failures are replayable. On success it stamps `lead.crmId`. Org-scoped + audited.

**Spec:** design doc §13 (events/jobs) / §15 (CRM connections).

## Tasks
- **T1** `crm-adapters.ts` (Webhook/Hubspot/Zoho stubs) + `crm-registry.ts`.
- **T2** `DeliveryService` (deliver / replay / listDeliveries / createMapping) + canonical-lead mapping + tests.
- **T3** `IntegrationHubController` (`/v1/leads/:id/deliver`, `/v1/leads/:id/deliveries`, `/v1/deliveries/:id/replay`, `/v1/crm-mappings`) + DTOs + module.

## Acceptance
- Idempotent (accepted attempt short-circuits); failed attempt marks `failed` and is replayable.
- Mapping validated before send; `lead.crmId` set on success; org-scoped + RBAC (deliver/replay/mapping=reviewer/admin, list=analyst).
- 4 unit tests (82 total); build/typecheck/test green; API boots.
