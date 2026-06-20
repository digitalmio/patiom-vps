# Patiom

Radically simple, containerless, bare-metal deployment for Node.js.

Zero proprietary config files. Zero Docker. Zero hidden build steps.

## Why Patiom?

### VPS prices are climbing

Hetzner — long the default for cheap VPSes — has been doubling and tripling
prices across its small-server lineup. The entry-level tiers where side projects
live are getting noticeably more expensive.

Container-based platforms like Coolify and Dokploy need 1–2 GB of RAM before your
first app even boots. On a 2 GB VPS, half your memory is gone before your code
runs. When the VPS itself just doubled in price, paying for Docker's overhead
becomes the expensive part — not your app.

Patiom runs your app as a bare systemd process — no container runtime, no
server-side builds, no build OOMs on small boxes. The daemon is a small Node
process and the reverse proxy is written in Rust. On a 1 GB VPS, nearly all
of that RAM is yours.

### "I could do this with a bash script"

You could — until you need the second deploy. A `rsync && pnpm install && systemctl restart`
script works right up until:

- A deploy breaks and you need to **roll back** to the previous release in one command,
  not reconstruct it from memory.
- You restart mid-deploy and **drop live traffic**. Patiom starts the new release on a
  fresh port, health-checks it, switches the proxy, then stops the old one.
- You add a second app and now you're hand-managing ports, proxy config, SSL renewal,
  and unit files for each one.
- Your app gets compromised and it has full access to the server, because it runs as
  your user. Patiom apps run as ephemeral, unprivileged users (`DynamicUser=yes`)
  locked to their own directory.
- You need to get `.env` secrets to the server without committing them or pasting
  them over SSH.

Patiom is that bash script, finished: releases, rollbacks, traffic switching, HTTPS,
sandboxing, and secrets — still just systemd and a reverse proxy underneath. Everything
it does is inspectable with `systemctl`, `journalctl`, and `ls`.

### "Why not Coolify or Dokploy?"

Use them — they're great at what they do. They're a different tool for a different job:

|                    | Coolify / Dokploy                  | Patiom                              |
|--------------------|------------------------------------|-------------------------------------|
| Model              | PaaS-in-a-box, any language        | Deployment tool, Node.js only       |
| Runtime            | Docker containers                  | Bare-metal processes under systemd  |
| Builds happen      | On your server                     | On your machine or in CI — never on the server |
| Server overhead    | ~1–2 GB RAM before your first app  | A small daemon and a Rust proxy     |
| Minimum hardware   | A real VPS                         | A $3 VPS or a Raspberry Pi          |
| Databases          | Databases run in containers       | File-based DB engines (SQLite, Turso, DuckDB) |
| Persistent storage | Docker volumes (manual config)     | Built-in `storage/` folder, zero config |
| Config             | Web dashboard + compose files      | A `patiom` key in `package.json`    |

If you run 15 services in 6 languages with one-click Postgres, you want Coolify.
If you run Node apps and want your 1 GB VPS to spend its RAM on *your code* instead
of Docker and build steps, you want Patiom.

### What Patiom deliberately doesn't do

- **No Docker.** Your app is a process, not a container. Debug it with the tools you already know.
- **No server-side builds.** The server only ever runs `pnpm install` and your start script. Build OOMs on small VPSes are not a thing.
- **No database engine.** Patiom creates empty files in `db/` that survive every deploy. Open them with SQLite, Turso, DuckDB, or whatever you want. It's just a file.
- **No backup system (yet).** Backups (local or S3) are planned for v2. For now, `scp` your `shared/` folder or use whatever backup tool you prefer.
- **No YAML, no dashboard required.** If it can't be expressed in `package.json`, it doesn't exist.

## How it works

Patiom moves your project from your machine to your server using nothing but `package.json` and a lockfile. Everything is managed through the **CLI** on your machine and the **Daemon** running on your server.

## Quick Start

### 1. Server setup (one command)

```bash
curl -sSL https://raw.githubusercontent.com/digitalmio/patiom/main/packages/setup/setup.sh | sudo bash
```

This installs fnm + Node 24 + pnpm, the rpxy reverse proxy, and the Patiom daemon. It also configures the firewall and sets up Let's Encrypt for SSL. At the end, you'll get a **master token** — store it safely.

### 2. Install the CLI

```bash
npm install -g @patiom/cli
```

### 3. Deploy your first app

```bash
patiom login --url http://YOUR_SERVER_IP:4000 --token YOUR_MASTER_TOKEN
cd my-project
patiom init
patiom deploy
```

That's it. Your app is running behind rpxy with automatic HTTPS, sandboxed under systemd.

## Commands

```
patiom login     Link your machine to a Patiom daemon
patiom init      Bootstrap a project for deployment
patiom deploy    Build, zip, and upload your application
patiom db         Manage persistent database files
patiom env         Manage environment variables (set, delete)
patiom token       Manage auth tokens (create, list, revoke)
```

## Project setup

`patiom init` adds a `patiom` key to your `package.json`:

```json
{
  "name": "my-api",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "patiom": {
    "include": ["dist"],
    "domains": ["api.mydomain.com"],
    "sslipDomain": true,
    "instances": 2,
    "dbFolder": "db",
    "storageFolder": "storage"
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `include` | `[]` | Files and directories to bundle in the deployment archive |
| `domains` | `[]` | Custom domain names (optional) |
| `sslipDomain` | `false` | Auto-assign a free `{name}.{ip}.sslip.io` subdomain (optional) |
| `instances` | `1` | Number of processes to run (optional, future: `"maxcpu"`) |
| `dbFolder` | `"db"` | Folder for persistent databases, symlinked per release (optional) |
| `storageFolder` | `"storage"` | Folder for uploads, cache, generated files, symlinked per release (optional) |

At least one of `domains` or `sslipDomain: true` must be set for the app to be reachable.

That's it. No `patiom.toml`, no `Dockerfile`, no YAML.

## Build

If your `package.json` has a `scripts.build`, the CLI runs it locally before deploying. Patiom detects your package manager (pnpm, npm, or yarn) from your lockfile and runs the build with it.

If you have no build script, Patiom deploys your source as-is.

## Deploy

```
patiom deploy           # build + upload to production
patiom deploy --dry-run # build + zip locally without uploading
```

`patiom deploy` archives `package.json`, your lockfile, and everything in `patiom.include`, then uploads the archive to your daemon.

## On the server

The daemon always uses **pnpm**. It extracts the archive, runs `pnpm install`, then runs whichever script exists (checked in order):

1. `pnpm run patiom`
2. `pnpm run start`

If your `start` script uses npm or yarn, add a `patiom` script with pnpm equivalents:

```json
{
  "scripts": {
    "start": "yarn run dev",
    "patiom": "pnpm run dev"
  }
}
```

## Persistent Data

Patiom keeps your data safe across deployments through two special folders in `shared/`:

```
/var/lib/patiom/apps/my-api/
├── releases/           # each deploy gets its own ULID-named directory
├── shared/
│   ├── .env            # secrets (never in the archive)
│   ├── db/             # databases survive every deploy
│   └── storage/        # uploads, cache, exports survive every deploy
└── current → releases/01HXYZ.../
```

On each deploy, the daemon symlinks `db/` and `storage/` into the release directory. Your code accesses them with natural paths:

```js
// Databases — just a file
import Database from "better-sqlite3";
const db = new Database("./db/data.db");

// Uploads — just a folder
import fs from "node:fs";
fs.writeFileSync("./storage/uploads/avatar.png", buffer);
```

Both folders persist across deployments. Deploy 100 times — your data stays.

#### Databases (`patiom.dbFolder`)

```bash
patiom db list            # show all databases
patiom db add sessions    # create an empty sessions.db
patiom db add cache       # create an empty cache.db
patiom db remove cache    # remove it
```

Patiom creates empty database files. **What you open them with is up to you.**

| Library | How you use it |
|---------|---------------|
| SQLite | `new Database("./db/data.db")` |
| Turso Embedded Replica | `createClient({ url: "file:./db/data.db", syncUrl: "...", authToken: "..." })` |
| DuckDB (Node) | `new duckdb.Database("./db/data.db")` |
| Anything file-based | `./db/whateveryouwant.db` |

Since Patiom only creates empty files, you're never locked into a specific database library. The `.db` file is just a file.

**Example: Turso Embedded Replicas**

```js
import { createClient } from "@libsql/client";

const db = createClient({
  url: "file:./db/app.db",
  syncUrl: "libsql://my-app.turso.io",
  syncInterval: 60,
  authToken: process.env.TURSO_TOKEN,
});

// Reads/writes go to the local file — fast
await db.execute("SELECT * FROM users");

// Sync pushes local changes to Turso, pulls remote changes
await db.sync();
```

Turso auth tokens go in your `.env` file (never committed, never in the archive). No daemon changes needed — the libSQL client handles sync.

#### Environment Variables

Secrets and environment variables live in `shared/.env` — never in your archive, never committed. The daemon injects them into your app via systemd's `EnvironmentFile`.

```bash
patiom env set KEY=VALUE    # set or update a variable
patiom env delete KEY       # remove a variable
```

Example:

```bash
patiom env set TURSO_TOKEN=eyJhbG...
patiom env set PORT=8080
patiom env delete OLD_SECRET
```

The file is stored with `0600` permissions — only the daemon and your app can read it.

#### Storage (`patiom.storageFolder`)

General-purpose persistent folder for anything that should survive deployments:

```
./storage/uploads/     # user-uploaded files
./storage/cache/       # generated cache
./storage/exports/     # PDF reports, data exports
./storage/logs/        # application logs
```

No CLI commands needed — just write files to `./storage/`. The daemon auto-creates the folder on first deploy.

## Auth Tokens

Tokens control access to the daemon API from the CLI or CI/CD pipelines. The master token is created during server setup.

| Scope | Can deploy/manage env/db | Can manage tokens |
|-------|--------------------------|-------------------|
| master | yes | yes |
| rw | yes | no |
| ro | no (read-only) | no |

```bash
patiom token create --name "CI/CD" --scope rw    # create a deploy token
patiom token list                                  # list all tokens
patiom token revoke <id>                           # revoke a token
```

The master token cannot be revoked via the API. Store it safely.

## sslip.io Domains

Opt in to a free subdomain by setting `"sslipDomain": true`:

```
my-api.1-2-3-4.sslip.io
```

The domain is constructed from your app name and server IP (dots replaced with dashes). It resolves instantly — no DNS setup needed. Uses [sslip.io](https://sslip.io) wildcard DNS.

> **Rate limits:** sslip.io domains share a single Let's Encrypt rate limit bucket. During peak hours, certificate issuance may fail due to heavy usage by other users. If you need reliable SSL, use a custom domain instead — `"domains": ["api.mydomain.com"]`, or see [managed domains](#managed-domains-planned) below.

> **How SSL works:** All certificates are issued by [Let's Encrypt](https://letsencrypt.org). You provide your email during server setup. Certificates are auto-renewed by rpxy.

## First-time login

```bash
patiom login --url http://YOUR_SERVER_IP:4000 --token YOUR_TOKEN    # non-interactive
patiom login                                                         # interactive
```

You'll be prompted for your daemon URL and auth token (or pass them as flags). Credentials are saved to your system config directory — the CLI prints the path on success.

## Coming in v2

- **Database backups** — local snapshots or push to S3-compatible storage. `patiom backup` and `patiom backup --s3`.
- **Release pruning** — keep last N releases, automatically drop older ones.
- **`patiom rollback`** — swap to the previous release in one command.
- **`patiom logs`** — stream app logs from `journalctl` to your terminal.
- **`instances: "maxcpu"`** — automatically scale to all available CPU cores.
- **Staging / preview deploys** — `patiom deploy --staging` deploys without going live (Fly.io style). Promote to live when ready.
- **Multi-server support** — deploy to different servers from one config. `~/.config/patiom-nodejs/config.json` stores a list of servers, `patiom deploy --server staging` picks the target.

## Managed domains (planned)

> These are ideas we're exploring — not commitments. They depend on the project's success and community interest.

- **`patiom.run` domains** — dedicated subdomains with managed SSL, no shared rate limits. `patiom deploy` automatically provisions `{name}.patiom.run` with valid certificates.
- **Custom deployment domains** — bring your own domain (e.g. `foo.example.com`), delegate DNS to Patiom nameservers, and get automatic wildcard SSL for all your apps. No manual certificate management.

## Monorepo structure

```
patiom/
├── packages/
│   ├── cli/        @patiom/cli — developer tool
│   ├── daemon/     @patiom/daemon — server agent
│   └── setup/      setup.sh — server bootstrap script
├── pnpm-workspace.yaml
└── package.json
```

## Development

```bash
pnpm install
cd packages/cli
pnpm dev     # tsx watch src/index.ts
pnpm build   # tsdown
```
