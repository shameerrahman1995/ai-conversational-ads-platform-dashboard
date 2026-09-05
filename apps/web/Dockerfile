# syntax=docker/dockerfile:1
#
# @acp/web — Next.js 16 dashboard, built in `standalone` mode.
# Multi-stage, non-root, pnpm via corepack, pinned to the repo's Node/pnpm.
# Build context is the monorepo ROOT (see infra/docker-compose.yml / deploy.yml).

# ---- Base: Node 22 (alpine) + pnpm@11.5.2 via corepack -----------------------
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app

# ---- Build: install ALL deps once, then build the @acp/web graph with turbo ---
FROM base AS build
# NEXT_PUBLIC_* is inlined at build time — provide it as a build arg so the
# browser bundle points at the right API origin (default: local dev).
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@acp/web...

# ---- Runner: minimal final image, non-root -----------------------------------
# Next standalone output already contains a traced, production-only node_modules,
# so the runner needs neither pnpm nor a second install.
FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# The standalone build mirrors the monorepo layout from the workspace root,
# so the server entrypoint lands at apps/web/server.js.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
# NOTE: no `public/` dir exists in apps/web today; add a COPY for it if one lands.

# Drop to the built-in unprivileged user.
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
