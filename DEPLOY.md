# Deploying ConvoAds AI

Production containerization for the three runtime services — **api** (NestJS),
**workers** (BullMQ consumers), and **web** (Next.js) — plus the backing
Postgres / Redis / MinIO tier.

All images are multi-stage, run as a **non-root** user, use **pnpm via corepack**,
and are pinned to **Node 22** / **pnpm 11.5.2** (matching the repo). Each Dockerfile
expects the **monorepo root** as its build context.

## Images

| Service | Dockerfile             | Entrypoint                      | Port |
| ------- | ---------------------- | ------------------------------- | ---- |
| api     | `apps/api/Dockerfile`  | `node apps/api/dist/main.js`    | 4000 |
| workers | `apps/workers/Dockerfile` | `node apps/workers/dist/index.js` | –    |
| web     | `apps/web/Dockerfile`  | `node apps/web/server.js` (Next standalone) | 3000 |

## Build the images

Build from the repo root (the `-f` path selects the app, `.` is the context):

```bash
docker build -f apps/api/Dockerfile     -t ghcr.io/<owner>/<repo>/api:local     .
docker build -f apps/workers/Dockerfile -t ghcr.io/<owner>/<repo>/workers:local .
# NEXT_PUBLIC_* is baked at build time — pass the public API origin for the browser:
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  -t ghcr.io/<owner>/<repo>/web:local .
```

## Run the full stack locally

The compose file wires the app tier to the existing Postgres / Redis / MinIO and
creates the `acp-assets` bucket via a one-shot `minio-createbucket` job:

```bash
docker compose -f infra/docker-compose.yml up -d --build
# web  → http://localhost:3000
# api  → http://localhost:4000  (health at /health, docs at /docs)
```

Bring it down with `docker compose -f infra/docker-compose.yml down`
(add `-v` to also drop the Postgres/Redis/MinIO volumes).

## Required environment variables

Validated at API/worker boot by `@acp/config` (`packages/config/src/env.ts`).
See `.env.example` for the canonical list.

| Variable                | Required | api | workers | web | Notes |
| ----------------------- | :------: | :-: | :-----: | :-: | ----- |
| `DATABASE_URL`          | ✅       | ✅  | ✅      |     | Postgres connection string |
| `REDIS_URL`             | ✅       | ✅  | ✅      |     | Queues / sessions / rate limits |
| `API_PORT`              |          | ✅  |         |     | Defaults to `4000` |
| `API_BASE_URL`          |          | ✅  |         |     | Defaults to `http://localhost:4000` |
| `S3_ENDPOINT`           |          | ✅  | ✅      |     | S3-compatible (MinIO locally) |
| `S3_REGION`             |          | ✅  | ✅      |     | Defaults to `us-east-1` |
| `S3_ACCESS_KEY_ID`      |          | ✅  | ✅      |     | Object-storage credential |
| `S3_SECRET_ACCESS_KEY`  |          | ✅  | ✅      |     | Object-storage credential |
| `S3_BUCKET`             |          | ✅  | ✅      |     | Defaults to `acp-assets` |
| `ANTHROPIC_API_KEY`     |          | ✅  | ✅      |     | Server-side only — never expose to the browser |
| `NEXT_PUBLIC_API_BASE_URL` |       |     |         | ✅  | **Build arg** — inlined into the browser bundle |

> `NEXT_PUBLIC_*` values are baked at `docker build` time, not read at runtime.
> Set them with `--build-arg` (or the compose `build.args`) for the correct origin.

## Migrate on deploy

Database schema changes are applied with Prisma's forward-only deploy command
**before** rolling the app containers:

```bash
pnpm --filter @acp/db exec prisma migrate deploy
```

This runs as a dedicated step in the `deploy` job of
`.github/workflows/deploy.yml` (using the `DATABASE_URL` secret), after the three
images are pushed to GHCR and before the deploy-target hook.

## CI/CD

- **CI** (`.github/workflows/ci.yml`) — install, build, typecheck, test on every
  push/PR.
- **CD** (`.github/workflows/deploy.yml`) — on push to `main` or a `v*` tag:
  1. `build-and-push` builds all three images (matrix) and pushes them to
     `ghcr.io/<owner>/<repo>/{api,workers,web}`, tagged by SHA/branch/tag and
     `latest` on the default branch.
  2. `deploy` runs `prisma migrate deploy`, then a **placeholder** step marking
     where to wire the real deploy target (Fly.io / ECS / Kubernetes /
     `docker compose pull && up -d` over SSH). Roll **api + workers first**, then
     **web**, once healthy.
