# syntax=docker/dockerfile:1
#
# @acp/api — NestJS HTTP API (blueprint §; ConvoAds AI).
# Multi-stage, non-root, pnpm via corepack, pinned to the repo's Node/pnpm.
# Build context is the monorepo ROOT (see infra/docker-compose.yml / deploy.yml).

# ---- Base: Node 22 (alpine) + pnpm@11.5.2 via corepack -----------------------
FROM node:22-alpine AS base
# openssl is required by the Prisma query engine (linux-musl target) at runtime.
RUN apk add --no-cache openssl
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app

# ---- Build: install ALL deps once, then build the @acp/api graph with turbo ---
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# turbo builds @acp/api and everything it depends on, incl. `prisma generate`
# in @acp/db (the linux-musl engine is produced here, inside the container).
RUN pnpm exec turbo run build --filter=@acp/api...

# ---- Prod deps: production-only node_modules for the whole workspace ----------
FROM base AS prod-deps
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# ---- Runner: minimal final image, non-root -----------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV API_PORT=4000
WORKDIR /app

# Workspace layout + production-only node_modules (preserves pnpm symlinks).
COPY --from=prod-deps /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api ./apps/api
COPY --from=prod-deps /app/packages ./packages
COPY --from=prod-deps /app/db ./db

# Overlay compiled artifacts (dist) + the generated Prisma client.
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/db/generated ./db/generated
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/connectors/dist ./packages/connectors/dist
COPY --from=build /app/packages/crm/dist ./packages/crm/dist
COPY --from=build /app/packages/jobs/dist ./packages/jobs/dist
COPY --from=build /app/packages/policy/dist ./packages/policy/dist
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist

# Drop to the built-in unprivileged user.
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

CMD ["node", "apps/api/dist/main.js"]
