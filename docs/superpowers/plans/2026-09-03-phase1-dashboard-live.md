# Phase 1 — Dashboard Live Wiring Implementation Plan

**Goal:** Wire the Next.js dashboard to the API via the typed `@acp/api-client` so pages render live data (with loading/empty/error states) once the API is running.

**Architecture:** Expanded `@acp/api-client` with typed resource methods (analytics.funnel, campaigns.list/create, leads.list, sources.list, health) + header-based dev auth. Web adds an `OrgProvider`/`useOrg` context (localStorage-persisted org/role), a `useApiClient()` hook, a `useAsync` hook, an `OrgSwitcher` in the top bar, and client-component data panels (FunnelPanel, CampaignsTable, LeadsTable) wired to Home/Campaigns/Leads. Two missing API list endpoints added (`GET /v1/campaigns`, `GET /v1/sources`), org-scoped + RBAC.

**Spec:** design doc §3/§4 (frontend IA + operations dashboard).

## Tasks
- **T1** Expand `@acp/api-client` (typed methods + response types + header auth).
- **T2** API: `GET /v1/campaigns` (listCampaigns) + `GET /v1/sources` (listSources) + tests.
- **T3** Web: org/role context + api hook + useAsync + OrgSwitcher + FunnelPanel/CampaignsTable/LeadsTable wired into Home/Campaigns/Leads with loading/empty/error.

## Acceptance
- `pnpm build`/`typecheck`/`test` green (106 API tests, +2 list-endpoint tests).
- API boots; new list endpoints return 400 without `x-org-id`.
- Web boots; Home/Campaigns/Leads render the data layer + org/role switcher; graceful loading/empty/error when the API is down.

## Env note
Live data requires the API + Postgres running (`pnpm infra:up` → `pnpm db:migrate` → run api). Without them the dashboard shows the friendly "Start the API to see live data" state — verified at build/boot level here.
