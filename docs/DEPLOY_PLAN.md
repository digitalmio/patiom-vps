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
| ingestor               | `ingest.patiom.dev`                   | Matches SDK default — zero client config             |
| demo                   | `swql.dev` (apex)                     | `PATIOM_ENDPOINT=https://ingest.patiom.dev`          |
| api                    | workers.dev                           | Custom domain later, with web app                    |
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
6. **Hyperdrive** (optional) — `wrangler hyperdrive create` for PlanetScale Postgres;
   edge pooling + query caching; fixes the idle-socket class of issues at the source.
7. **Migrations switch (very last)** — `db:generate` baseline from current schema,
   verify against scratch DB, switch CI/deploy.sh from push to migrate.

## User-side prerequisites

- [ ] Zones `patiom.dev` + `swql.dev` in Cloudflare account
- [ ] PlanetScale Postgres database + role (pooled connection string)
- [ ] GitHub secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit + Queues:Edit),
      `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL`
- [ ] One-time worker secrets (local `wrangler secret put`):
  - `DATABASE_URL` → ingestor, worker-schema, worker-logs, api
  - `IPLOCATE_KEY` → worker-logs (optional)
  - `PATIOM_TOKEN` → demo (project token for its Patiom project)

## Notes

- Deploy order matters: queue consumers (worker-schema, worker-logs) before producers
  (ingestor), so no message lands on a missing consumer.
- `drizzle-kit push` in CI must run non-interactively (`--force`); switch to migrate
  before prod data matters.
- Demo/web deploy can be extended later ("deploy the lot").
