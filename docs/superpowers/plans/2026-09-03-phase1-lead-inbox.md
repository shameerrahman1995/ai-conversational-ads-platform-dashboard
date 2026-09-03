# Phase 1 — Lead Inbox (P1.L) Implementation Plan

**Goal:** Consent-first lead intake with field-level source, dedupe, scoring, ownership, and lifecycle management — the unified lead inbox.

**Architecture:** `LeadModule`. `lead-scoring.ts` (pure: normalizeField, computeLeadScore). `LeadService` writes `Lead` + `LeadFieldValue` (per-field `source`) + `ConsentRecord` (separate consent types), dedupes by normalized email/phone (org-scoped relation filter), scores, and manages assign/status/suppress/delete/merge. All queries org-scoped + audited.

**Spec:** design doc §7 (unified lead inbox) / §10 (Lead management).

## Tasks
- **T1** `lead-scoring.ts` (normalizeField, computeLeadScore) + tests.
- **T2** `LeadService` (createLead w/ dedupe+consent+fields+score, listLeads, getLead, assignOwner, updateStatus, suppress, deleteLead, merge) + tests.
- **T3** `LeadController` `/v1/leads` (create=creator, list/get=analyst, assign/status/suppress/merge=reviewer, delete=admin) + DTOs + module.

## Acceptance
- Field-level source recorded; separate consent records per type; dedupe on email/phone returns existing lead (no duplicate).
- Deterministic score; all reads/writes org-scoped; RBAC per action.
- Merge moves field/consent rows to target + deletes source (evidence audited).
- 11 unit tests (78 total); build/typecheck/test green; API boots.
