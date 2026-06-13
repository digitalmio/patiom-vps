# Patiom

Radically simple, containerless, bare-metal deployment for Node.js.

Zero proprietary config files. Zero Docker. Zero hidden build steps.

## Why Patiom?

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

### Commands

```
patiom login     Link your machine to a Patiom daemon
patiom init      Bootstrap a project for deployment
patiom deploy    Build, zip, and upload your application
patiom db         Manage persistent database files
patiom env         Manage environment variables (set, delete)
```

### Project setup

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
    "patiomRunDomain": true,
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
| `patiomRunDomain` | `true` | Auto-assign a free `{name}.{ip}.patiom.run` subdomain |
| `instances` | `1` | Number of processes to run (future: `"maxcpu"`) |
| `dbFolder` | `"db"` | Folder for persistent databases (symlinked per release) |
| `storageFolder` | `"storage"` | Folder for uploads, cache, generated files (symlinked per release) |

That's it. No `patiom.toml`, no `Dockerfile`, no YAML.

### Build

If your `package.json` has a `scripts.build`, the CLI runs it locally before deploying. Patiom detects your package manager (pnpm, npm, or yarn) from your lockfile and runs the build with it.

If you have no build script, Patiom deploys your source as-is.

### Deploy

```
patiom deploy           # build + upload to production
patiom deploy --dry-run # build + zip locally without uploading
```

`patiom deploy` archives `package.json`, your lockfile, and everything in `patiom.include`, then uploads the archive to your daemon.

### On the server

The daemon always uses **pnpm**. It extracts the archive, runs `pnpm install`, then runs whichever script exists (checked in order):

1. `pnpm run patiom`
2. `pnpm run start`

If you use a different package manager locally, your scripts are converted automatically.

### Persistent Data

Patiom keeps your data safe across deployments through two special folders in `shared/`:

```
/var/lib/patiom/apps/my-api/
├── releases/           # each deploy gets its own timestamped directory
├── shared/
│   ├── .env            # secrets (never in the archive)
│   ├── db/             # databases survive every deploy
│   └── storage/        # uploads, cache, exports survive every deploy
└── current → releases/1717087200/
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

### patiom.run Domains

Every app gets a free subdomain automatically:

```
my-api.1-2-3-4.patiom.run
```

The domain is constructed from your app name and server IP (dots replaced with dashes). It resolves instantly — no DNS setup needed. Uses sslip.io-style wildcard DNS under the hood.

> **How SSL works:** All certificate requests go through the Patiom ACME relay. For `*.patiom.run` domains, the relay issues certificates via [ZeroSSL](https://zerossl.com) under Patiom's account. For your custom domains, requests are forwarded to Let's Encrypt. We see your certificate requests but never your private keys.
>
> If you'd rather manage your own certificates, run `setup.sh --no-acme-proxy --email you@example.com`. Your domains will get certificates directly from Let's Encrypt — but `patiom.run` subdomains won't work.

To opt out of the automatic subdomain, set `"patiomRunDomain": false` in your config. Custom domains are configured via `"domains": ["api.mydomain.com"]`.

### First-time login

```
patiom login
```

You'll be prompted for your daemon URL and auth token. Credentials are saved to `~/.patiom/config.json`.

## Coming in v2

- **Database backups** — local snapshots or push to S3-compatible storage. `patiom backup` and `patiom backup --s3`.
- **Release pruning** — keep last N releases, automatically drop older ones.
- **`patiom rollback`** — swap to the previous release in one command.
- **`patiom logs`** — stream app logs from `journalctl` to your terminal.
- **`instances: "maxcpu"`** — automatically scale to all available CPU cores.
- **Staging / preview deploys** — `patiom deploy --staging` deploys without going live (Fly.io style). Staging instances run on separate ports with unique subdomains (`{name}-{nanoid}.{ip}.patiom.run`). Promote to live when ready.
- **Multi-server support** — deploy to different servers from one config. `~/.patiom/config.json` stores a list of servers, `patiom deploy --server staging` picks the target.

## Monorepo structure

```
patiom/
├── packages/
│   ├── cli/        @patiom/cli — developer tool
│   ├── daemon/     @patiom/daemon — server agent (planned)
│   └── shared/     shared types & schemas (planned)
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
