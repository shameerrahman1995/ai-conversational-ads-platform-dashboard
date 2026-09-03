# AI Conversational Ads Platform (ConvoAds AI)

Multi-tenant SaaS that turns a product page (website / PDF / feed / brand brief) into
compliant cross-platform ads **plus** a 24/7 post-click AI sales agent, then delivers
qualified leads and revenue signals to the customer's CRM.

North-star metric: **cost per qualified lead** (not CTR).

> Full design & phased delivery plan: [`docs/superpowers/specs/2026-09-03-ai-conversational-ads-platform-design.md`](docs/superpowers/specs/2026-09-03-ai-conversational-ads-platform-design.md)

## Monorepo layout

```
apps/
  web/       Next.js dashboard (9 areas)
  api/       NestJS modular monolith (10 modules)
  workers/   Node + BullMQ background workers (render, publish, ingestion, crm-sync)
packages/
  shared-types/  domain types + lifecycle enums
  config/        zod env schema + logger
  connectors/    ad-platform connector contract + capabilities types
  crm/           canonical lead schema + adapter contract
  policy/        claims / spec / region validation
  ui/            shared design-system components
  api-client/    typed client SDK (generated from OpenAPI later)
db/          Prisma schema + migrations (PostgreSQL)
infra/       docker-compose for local dev (Postgres, Redis, MinIO)
```

## Prerequisites

- Node >= 22 (`.nvmrc` pins 22)
- pnpm 11+
- Docker (for local Postgres/Redis/MinIO)

## Getting started

```bash
pnpm install                 # install workspace deps
cp .env.example .env         # fill in secrets (server-side only)
pnpm infra:up                # start Postgres, Redis, MinIO
pnpm db:generate             # generate Prisma client
pnpm build                   # build all packages + apps
pnpm dev                     # run web + api + workers in watch mode
```

- Dashboard: http://localhost:3000
- API + Swagger: http://localhost:4000/docs

## Status

Phase 1 — Private MVP · **Foundation scaffold (P1.F1)**. See the design doc for the full
5-phase roadmap and per-workstream tasks.
