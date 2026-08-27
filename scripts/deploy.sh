#!/usr/bin/env bash
set -euo pipefail

# Ordered Patiom deploy: DB schema first, then queue consumers, then
# producers, then the data API.
#
# One-time secrets (per worker, in apps/<name>):
#   wrangler secret put DATABASE_URL   # ingestor, worker-schema, worker-logs, api
#   wrangler secret put IPLOCATE_KEY   # worker-logs (optional)
#
# DB connection for the push step:
#   DATABASE_URL="postgres://..." ./scripts/deploy.sh

cd "$(dirname "$0")/.."

echo "==> Building packages"
pnpm -r build

echo "==> Pushing DB schema"
DATABASE_URL="${DATABASE_URL:?Set DATABASE_URL for drizzle-kit push}" \
  pnpm --filter @patiom/db migrate:push

echo "==> Creating queues (idempotent)"
for queue in patiom-schema-queue patiom-logs-queue patiom-schema-dlq patiom-logs-dlq; do
  wrangler queues create "$queue" 2>/dev/null || echo "    $queue already exists"
done

deploy() {
  echo "==> Deploying $1"
  pnpm --filter "$1" exec wrangler deploy
}

# Consumers before producers so no message lands on a missing consumer
deploy @patiom/worker-schema
deploy @patiom/worker-logs
deploy @patiom/ingestor
deploy @patiom/api

echo "==> Done"
