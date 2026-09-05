# syntax=docker/dockerfile:1
#
# @acp/workers — BullMQ queue consumers (render · publish · ingestion · crm-sync).
# Multi-stage, non-root, pnpm via corepack, pinned to the repo's Node/pnpm.
# Build context is the monorepo ROOT (see infra/docker-compose.yml / deploy.yml).

# ---- Base: Node 22 (alpine) + pnpm@11.5.2 via corepack -----------------------
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app

# ---- Build: install ALL deps once, then build the @acp/workers graph ----------
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@acp/workers...

# ---- Prod deps: production-only node_modules for the whole workspace ----------
FROM base AS prod-deps
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# ---- Runner: minimal final image, non-root -----------------------------------
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

# Workspace layout + production-only node_modules (preserves pnpm symlinks).
COPY --from=prod-deps /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/workers ./apps/workers
COPY --from=prod-deps /app/packages ./packages

# Overlay compiled artifacts (dist). Workers only need config/jobs/shared-types.
COPY --from=build /app/apps/workers/dist ./apps/workers/dist
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/jobs/dist ./packages/jobs/dist
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist

# Drop to the built-in unprivileged user.
USER node

CMD ["node", "apps/workers/dist/index.js"]
