#!/usr/bin/env bash
# Run the ConvoAds stack locally (API + workers + web) against your native
# Postgres + Redis. Run this in YOUR OWN terminal so the servers persist:
#
#   bash run-local.sh
#
# Ctrl+C stops all three. Requires: brew services postgres@17 + redis running,
# and a built repo (pnpm -r build). Uses the `acp` database seeded earlier.
set -euo pipefail
cd "$(dirname "$0")"

export DATABASE_URL="${DATABASE_URL:-postgresql://shameer@localhost:5432/acp}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
# Project convention: local services run on a 4000-block — API :4000, web :4001
# (workers have no HTTP port; :4002 reserved for future services).
export API_PORT="${API_PORT:-4000}"
export WEB_PORT="${WEB_PORT:-4001}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:$WEB_PORT}"
export NODE_ENV="${NODE_ENV:-development}"

echo "→ Building (skip with SKIP_BUILD=1)…"
[ "${SKIP_BUILD:-0}" = "1" ] || pnpm -r build

echo "→ Starting API (:$API_PORT), workers, and web (:$WEB_PORT)…"
node apps/api/dist/main.js &        API_PID=$!
node apps/workers/dist/index.js &   WK_PID=$!
( cd apps/web && node_modules/.bin/next start -p "$WEB_PORT" ) & WEB_PID=$!

# Stop everything together on Ctrl+C / exit.
trap 'echo; echo "Stopping…"; kill $API_PID $WK_PID $WEB_PID 2>/dev/null || true' INT TERM EXIT

cat <<EOF

  ConvoAds AI is running:
    Web    http://localhost:$WEB_PORT
    API    http://localhost:$API_PORT   (docs at /docs)
    Workers: render · publish · ingestion · crm-sync

  Dev headers for the API: x-org-id: org_demo   x-user-role: admin
  Press Ctrl+C to stop.
EOF

wait
