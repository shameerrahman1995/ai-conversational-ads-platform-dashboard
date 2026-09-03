# Phase 1 — Creative Output (P1.R) Implementation Plan

**Goal:** Compile a creative variant into the standard multi-format output set, validate against platform format specs, and store an artifact manifest.

**Architecture:** `CreativeModule`. `RenderPort` + deterministic `StubRenderer` emits 1:1 / 4:5 / 9:16 images, a video storyboard, and a Google display HTML5 bundle. `format-spec.ts` holds format specs (dimensions; Google's 600 KB HTML5 limit) + `validateOutputs`. `CreativeService.render` validates outputs and stores `{outputs, validation}` on `CreativeVariant.manifest`, setting status `rendered` | `validation_failed`. Org-scoped + audited. Real renderer swaps in behind `RenderPort`.

**Spec:** design doc §10 (Creative rendering) / §14 (bundle limits).

## Tasks
- **T1** Schema: `CreativeVariant.manifest Json?`; regenerate client + migration.
- **T2** `format-spec.ts` (FORMAT_SPECS, RenderOutput, validateOutputs) + tests.
- **T3** `RenderPort` + `StubRenderer` + test.
- **T4** `CreativeService` (createVariant / render / listVariants / getVariant) + tests.
- **T5** `CreativeController` (`/v1/campaigns/:id/variants`, `/v1/variants/:id/render`, `/v1/variants/:id`) + DTO + module.

## Acceptance
- Standard output set validates clean; wrong dimensions / oversize HTML5 / unknown format are flagged.
- `render` stores a manifest and sets `rendered` vs `validation_failed`.
- All queries org-scoped; missing variant/campaign → 404.
- 10 unit tests (67 total); build/typecheck/test green; API boots.
