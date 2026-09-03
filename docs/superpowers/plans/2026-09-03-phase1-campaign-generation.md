# Phase 1 — Campaign Generation (P1.C) Implementation Plan

**Goal:** Generate versioned campaign copy from APPROVED facts, annotate every claim as source-backed or "Needs verification", and regenerate a single field into a new version (never mutate a live version).

**Architecture:** `CampaignService` in the campaign-intel module. `CopyGeneratorPort` + deterministic `StubCopyGenerator` (proof points are verbatim approved facts; headline/offer/cta generated). Each generate/regenerate creates a new immutable `CampaignVersion` (snapshot = copy + claim annotations), bumps `campaign.version`, and sets status GENERATED. Org-scoped + audited. Real LLM generator swaps in behind the port later.

**Spec:** design doc §5 (guided creation) / §10 (Campaign intelligence).

## Tasks
- **T1** `copy-generator.port.ts` (COPY_GENERATOR, CampaignCopy, CopyField, CopyGeneratorPort).
- **T2** `StubCopyGenerator` + test.
- **T3** `CampaignService` (createDraft / generate / regenerateField / getVersions) + test.
- **T4** `CampaignController` `/v1/campaigns` (create, :id/generate, :id/regenerate, :id/versions — creator) + DTOs + module wiring.

## Acceptance
- Copy generated ONLY from approved facts (`sourceFact where approved:true`, org-scoped).
- Proof points (verbatim facts) → `supported:true`; generated lines → `supported:false` ("Needs verification").
- Regenerate changes only the requested field and writes a NEW version.
- All queries org-scoped; unsupported regenerate field rejected (400).
- 6 unit tests; build/typecheck/test green; API boots.
