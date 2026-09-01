# Patiom Deploy Plan

## Architecture

```
push to main ──▶ CI (typecheck/lint/test/build) ──▶ Deploy
                                                    ├─ db: push (for now*)
                                                    ├─ queues (idempotent create)
                                                    ├─ worker-schema  (consumer)
                                                    ├─ worker-logs    (consumer)
                                                    ├─ ingestor       ──▶ ingest.patiom.dev
                                                    ├─ api            (workers.dev for now)
                                                    └─ demo           ──▶ swql.dev (apex)

PRs ──▶ CI only
```

\* Deploy uses `drizzle-kit push` initially; **switch to generate + migrate as the very last step**
(baseline migration, scratch-DB verification, `deploy.sh` + workflow update).

## Domain map

| Worker                 | Domain                                | Notes                                                |
| ---------------------- | ------------------------------------- | ---------------------------------------------------- |
| web                    | `patiom.dev` (apex)                   | TanStack Start on Workers (`@cloudflare/vite-plugin`) |
| ingestor               | `ingest.patiom.dev`                   | Matches SDK default — zero client config             |
| demo                   | `swql.dev` (apex)                     | `PATIOM_ENDPOINT=https://ingest.patiom.dev`          |
| api                    | workers.dev                           | Custom domain later                                  |
| worker-schema/worker-logs | (internal, queue consumers)        | No HTTP routes                                       |

Configured via `routes = [{ pattern = "...", custom_domain = true }]` — wrangler
auto-provisions DNS + certificates.

## Work order

1. **`docs/DEPLOY_PLAN.md`** (this file)
2. **CI workflow** — `.github/workflows/ci.yml`: pnpm v10 + Node 22, frozen lockfile +
   store cache → biome → typecheck → test → build. Triggers: PRs + main.
3. **Domain config** — ingestor `ingest.patiom.dev`, demo `swql.dev` + explicit
   `PATIOM_ENDPOINT`.
4. **Deploy workflow** — `.github/workflows/deploy.yml`: `deploy` job `needs: ci`,
   main-only; build → DB push → idempotent queue creation → deploy consumers before
   producers → demo.
5. **Verify** — first real deploy after user-side prerequisites are in place;
   smoke-test ingest → logs pipeline on prod.
6. **Hyperdrive** (done) — shared `patiom-primary` resource bound as `HYPERDRIVE`
   in web, api, ingestor, worker-schema, worker-logs. Postgres.js clients use
   `prepare: false, max: 5` per Hyperdrive guidance. Local dev connects directly
   via `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (see `scripts/dev`).
7. **Migrations switch (very last)** — `db:generate` baseline from current schema,
   verify against scratch DB, switch CI/deploy.sh from push to migrate.

## User-side prerequisites

- [ ] Zones `patiom.dev` + `swql.dev` in Cloudflare account
- [ ] PlanetScale Postgres database: **PS-10 non-HA (arm64), ~$10/mo** — pooled
      connection string. Upgrade to HA ($30/mo) when revenue justifies. Cheap
      fixed instance is viable because CF Queues buffer ingestion bursts;
      worker-logs writes at a steady trickle.
- [ ] GitHub secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit + Queues:Edit),
      `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL` (CI schema push only)
- [ ] One-time Hyperdrive setup: `wrangler hyperdrive create patiom-primary --connection-string=<PROD_URL>`
      → replace the placeholder id in every app's wrangler config
- [ ] One-time worker secrets (local `wrangler secret put`):
  - `IPLOCATE_KEY` → worker-logs (optional)
  - `PATIOM_TOKEN` → demo (project token for its Patiom project)
  - `BETTER_AUTH_SECRET` → api, web
  - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` → web
- [ ] Remove stale secrets if previously set: `wrangler secret delete DATABASE_URL`
      → ingestor, worker-schema, worker-logs, api

## Notes

- Deploy order matters: queue consumers (worker-schema, worker-logs) before producers
  (ingestor), so no message lands on a missing consumer.
- `drizzle-kit push` in CI must run non-interactively (`--force`); switch to migrate
  before prod data matters.
- Demo/web deploy can be extended later ("deploy the lot").
