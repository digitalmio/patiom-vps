# v0.2–v1.0 Plan — CLI polish, logs, metrics & cronjobs

## Overview

Six features, plus a deferred web dashboard and optional Valkey instances (v0.4). The SQLite-based job queue (`@patiom/queue`) has been dropped — instead, Patiom offers optional top-level Valkey/Redis instances for BullMQ users, and documents workmatic for file-based queue needs.

### Implementation order

| # | Feature | Scope | Dependencies |
|---|---------|-------|-------------|
| 1 | cli-table3 for table display | CLI only | None |
| 2 | `patiom logs` command | Daemon + CLI | None |
| 3 | Server metrics (CPU/mem/load/disk → NDJSON) | Daemon only | None |
| 4 | Per-app metrics (per-instance CPU/mem via cgroup v2) | Daemon only | Item 3 (shared module) |
| 5 | Cronjobs (systemd timers) | Daemon + CLI | Item 2 (log viewing) |
| 6 | Web dashboard | **Deferred** | Items 2–5 |
| 7 | Optional Valkey instances (top-level, per-app attach) | Daemon + CLI | None |

---

## 1. cli-table3 — Table display improvements

**Goal:** Replace plain `console.log` lists with bordered tables across all list-style CLI output.

**Package:** Add `cli-table3` to `packages/cli/package.json`.

**Affected CLI commands (display layers only, no data changes):**

| Command | Table content |
|---------|--------------|
| `patiom status` | Apps: `Name` / `Release` / `Status` / `Instances` / `Domains` |
| `patiom status --app <name>` | Instances: `Port` / `State` / `Last log line` |
| `patiom status --server` | Ports list + rpxy state row |
| `patiom token list` | `Name` / `Scope` / `Created` / `Last 8` |
| `patiom db list` | `Database` / `Size` |

**No daemon changes needed.**

---

## 2. `patiom logs` command

**Goal:** View (and optionally follow) app runtime logs from `journalctl` per instance.

**Streaming approach:** Polling every 2s (matches deploy-log polling pattern). Simple, no SSE/WebSocket.

### Daemon

**New endpoint:** `GET /apps/:name/logs`

Query params:
- `lines` — number of recent lines per instance (default 100, max 1000)
- `port` — filter to one instance
- `cursors` — JSON map of `{ "port": "cursor_string" }` for follow mode

Response:
```json
{
  "lines": [
    { "ts": "2026-06-21T10:00:00Z", "port": 50001, "message": "Server started" }
  ],
  "cursors": { "50001": "s=abc;c=123;..." }
}
```

Implementation:
- Uses `journalctl -u ${name}@${port} -n ${lines} --no-pager --output=json` for initial fetch
- Uses `journalctl -u ${name}@${port} --after-cursor=<cursor> -n 100 --no-pager --output=json` for follow
- Merges instances, sorts by timestamp
- Wire into existing `apps.ts` route file

### CLI

**New command:** `patiom logs [app] [options]`

Options:
- `--follow, -f` — poll every 2s, append new lines
- `--lines, -n` — number of lines per instance (default 50)
- `--port, -p` — filter to one instance

Default app resolved via `getAppName()` (same pattern as `env`/`db`/`deploy`).

Display: plain colored output (timestamps dimmed, port badges), not cli-table3 (log lines don't suit tabular format).

Ctrl+C clean exit via `process.on('SIGINT')` + `process.exit()`.

**New file:** `packages/cli/src/commands/logs.ts`

---

## 3. Server metrics → NDJSON (every 60s)

**Goal:** Collect server-wide CPU, memory, load, and disk usage once per minute, stored as NDJSON files. Retained for 365 days (configurable via `METRICS_RETENTION_DAYS` env var).

### Daemon

**New module:** `packages/daemon/src/core/metrics.ts`

`collectServerMetrics()`:
- **CPU:** Read `/proc/stat`, parse `cpu` line (user/nice/system/idle), compute delta from previous sample → `cpuPct` (0–100)
- **Memory:** Read `/proc/meminfo` → `MemTotal`, `MemAvailable` → `memUsed=MemTotal-MemAvailable`, `memPct`
- **Load:** `os.loadavg()` → `[1m, 5m, 15m]`
- **Disk:** `fs.statfs` or `df` on `PATIOM_ROOT` → total/used/avail

`startMetricsCollection(opts)`:
- Called from `startServer()` with optional `retentionDays` and `intervalMs`
- Sets up `setInterval` every 60s
- On startup: scan `/var/lib/patiom/metrics/server/`, delete `.ndjson` files older than retention
- Appends to daily file: `/var/lib/patiom/metrics/server/<YYYY-MM-DD>.ndjson`

**Storage layout:**
```
/var/lib/patiom/metrics/
└── server/
    ├── 2026-06-21.ndjson
    └── 2026-06-22.ndjson
```

**NDJSON format (one line per minute):**
```json
{"ts":"2026-06-21T10:00:00.000Z","cpuPct":12.5,"memTotal":1073741824,"memUsed":536870912,"memPct":50.0,"loadAvg":[0.5,0.4,0.3],"diskTotal":42949672960,"diskUsed":10737418240}
```

**New route:** `packages/daemon/src/routes/metrics.ts`

**New endpoint:** `GET /metrics/server`

Query params:
- `from` — ISO timestamp, inclusive (default: 1 hour ago)
- `to` — ISO timestamp, inclusive (default: now)

Response: array of metrics objects, sorted by `ts`.

**No new dependencies.** Pure `node:fs`, `node:os`, `/proc` reads.

**Config:** `METRICS_RETENTION_DAYS` env var, default `365`.

---

## 4. Per-app metrics (per-instance via cgroup v2)

**Goal:** Collect CPU and memory per app instance (per port) every 60s, same pattern as server metrics.

**Granularity:** Per-instance (per-port), not aggregate. Useful for multi-instance deploys.

### Daemon

Extends `core/metrics.ts` — same 60s interval, shared scheduling.

`collectAppMetrics()`:
1. For each app in `APPS_DIR`, call `listAllInstances(appName)`
2. For each running (`active`) instance `{appName}@{port}`:
   - **Memory:** Read `/sys/fs/cgroup/system.slice/${name}@${port}.service/memory.current` → bytes
   - **Memory max:** Read `.../memory.max` → limit (or `"max"` = no limit)
   - **CPU:** Read `.../cpu.stat` → `usage_usec` field, compute delta from previous sample → `cpuPct`
3. Detect cgroup v1 vs v2 at startup (check if `/sys/fs/cgroup/cgroup.controllers` exists)
   - v2 path: `/sys/fs/cgroup/system.slice/`
   - v1 fallback: `/sys/fs/cgroup/memory/system.slice/` + `/sys/fs/cgroup/cpu,cpuacct/system.slice/`

Append to: `/var/lib/patiom/metrics/apps/${appName}/<YYYY-MM-DD>.ndjson`

**Per-app NDJSON format:**
```json
{"ts":"2026-06-21T10:00:00.000Z","instances":[{"port":50001,"cpuPct":5.2,"memBytes":134217728,"memMax":268435456},{"port":50002,"cpuPct":3.1,"memBytes":100663296,"memMax":268435456}]}
```

**New endpoints** (same route file `metrics.ts`):

- `GET /metrics/apps/:name` — same `?from=&to=` query params as server metrics
  - Returns array of NDJSON lines with per-instance stats

---

## 5. Web dashboard — DEFERRED

Full management dashboard with:
- Server overview + charts (CPU/mem/load over time)
- App detail with live logs + metrics
- Token/environment management
- Deploy + restart actions

**Architecture decisions:** TBD when we're ready to implement. Options:
- Own domain (e.g. `dash.patiom.dev`) with localStorage/IndexedDB auth
- Built-in CLI command: `patiom studio` (starts local server, opens browser, talks to daemon API)

**Auth:** Login form (paste token → stored in localStorage → `Authorization: Bearer` on all API calls).

**Will not be implemented in this phase.** The features above must ship first.

---

## 6. Cronjobs — systemd timers (v0.3)

**Goal:** Let users define scheduled tasks in `package.json` that run as systemd timer units — no new daemon, no `node-cron`, no extra process. Everything stays inspectable with `systemctl list-timers` and `journalctl`.

### User config (in `package.json`)

```json
{
  "patiom": {
    "cron": [
      { "schedule": "0 3 * * *", "run": "cleanup" },
      { "schedule": "*/5 * * * *", "run": "health-check" }
    ]
  }
}
```

- `schedule` — standard cron syntax (5 fields). Converted to systemd `OnCalendar=` at deploy time.
- `run` — npm script name to execute.

### Daemon behavior

- On deploy, parse `patiom.cron` array
- For each entry:
  - Convert cron → systemd `OnCalendar=` expression
  - Create one-shot `.service` unit: `{app}-{task}.service` (runs `npm run <task>`)
  - Create `.timer` unit: `{app}-{task}.timer`
  - Enable + start the timer
- Same `DynamicUser=yes`, `WorkingDirectory`, `EnvironmentFile` as the main app
- Timers fire independently of instance count — one fire regardless of 1 or 3 instances
- Logs go to journalctl → viewable via `patiom logs` (when filtering by service name)

### Cron → systemd conversion

Standard cron to `OnCalendar=` mapping for common patterns:

| Cron | OnCalendar |
|------|-----------|
| `0 3 * * *` | `*-*-* 03:00:00` |
| `*/5 * * * *` | `*:0/5` |
| `0 * * * *` | `*-*-* *:00:00` |
| `0 0 * * 0` | `Sun *-*-* 00:00:00` |

Full implementation via small regex-to-OnCalendar converter (~50 lines). Power users can skip cron and write `OnCalendar=` syntax directly via a raw `timer` field.

### CLI

```bash
patiom cron list           # show all cronjobs for current app
patiom cron list --app <n>  # show for a specific app
```

### Scope estimate

~2–3 days. New template in `systemd.ts`, cron→OnCalendar converter, deploy flow changes, CLI command.

---

## 7. Optional Valkey instances (v0.4)

**Goal:** Manage per-instance, top-level Valkey (or Redis-server) instances as isolated systemd units. Apps attach via `patiom valkey attach <app> <name>` — `REDIS_URL` (or custom `--env-var`) is injected into the app's `.env` automatically. Multiple apps can share one Valkey (worker + web sharing a BullMQ queue).

### Why Valkey instead of a custom queue library?

- BullMQ is the industry standard (6.5M weekly downloads, MIT, actively maintained). A custom `@patiom/queue` library would be a half-baked BullMQ forever — every feature request becomes our maintenance burden.
- Valkey (Linux Foundation, BSD-licensed) is the fork of Redis after the license change. Drop-in compatible with Redis — existing BullMQ, ioredis, Bee-Queue code works unchanged.
- **File-based alternative:** For apps that want a simple SQLite-backed queue without Valkey, install [`workmatic`](https://www.npmjs.com/package/workmatic) against the existing `db/` folder — no Patiom changes needed.

### Topology

Valkey instances are **top-level server resources**, decoupled from any app:
- Data: `/var/lib/patiom/valkey/<name>/` — `valkey.conf`, `dump.rdb`
- Systemd unit: `patiom-valkey-<name>.service` (one per instance, not templated)
- Binding: loopback TCP (`127.0.0.1:<port>`) with random 32-char `requirepass`. Ports from existing `PORT_MIN/MAX` range via `allocatePortBlock()`.
- Why not Unix sockets? DynamicUser makes cross-unit socket access cumbersome (two random UIDs). Loopback + password is equivalent security-wise.

### Lifecycle

Valkey is **independent of app deploy/app restart**. Created/destroyed via explicit CLI commands. Survives deploys and app restarts.

### Daemon

**New module:** `packages/daemon/src/core/valkey.ts`
- `installIfMissing()` — check `which valkey-server || which redis-server`; lazy `apt-get install -y valkey-server` (fall back to `redis-server` on older distros)
- `generateConfig(name, port, password, options)` — write `valkey.conf`
- `create(name, options)` — allocate port, generate password, write config + systemd unit, `daemon-reload`, `enable --now`
- `destroy(name)` — `stop --disable`, delete unit file, `daemon-reload`, delete data dir
- `attach(name, appName, envVar?)` — write `REDIS_URL` (or custom env-var) to app's `.env`
- `detach(name, appName, envVar?)` — remove matching env line from app's `.env`
- `list()` — query systemd for all `patiom-valkey-*.service` units

**New route:** `packages/daemon/src/routes/valkey.ts`

| Method | Path | Scope | Audit | Body / Query |
|---|---|---|---|---|
| `POST` | `/valkey` | rw | ✓ | `{name, maxmemory?, aof?}` |
| `GET` | `/valkey` | ro | — | List all instances |
| `GET` | `/valkey/:name` | ro | — | Status (state, mem, port, attached apps) |
| `DELETE` | `/valkey/:name` | rw | ✓ | `{confirm: true}` |
| `POST` | `/valkey/:name/restart` | rw | ✓ | — |
| `POST` | `/valkey/:name/attach` | rw | ✓ | `{appName, envVar?}` |
| `POST` | `/valkey/:name/detach` | rw | ✓ | `{appName, envVar?}` |

**Config** (`config.ts`): add `VALKEY_DIR`, `DEFAULT_MAXMEMORY` (64MB).

### valkey.conf template

```
bind 127.0.0.1
port <allocated>
requirepass <random-32char>
maxmemory <bytes>
maxmemory-policy noeviction
dir /var/lib/patiom/valkey/<name>/
dbfilename dump.rdb
save 60 1
appendonly no
databases 1
protected-mode yes
```

`maxmemory-policy noeviction` is hardcoded — BullMQ silently drops jobs under any other policy.

### systemd unit template

```
[Unit]
Description=Patiom Valkey: <name>
After=network.target
StartLimitIntervalSec=0

[Service]
Type=notify
ExecStart=<binary> /var/lib/patiom/valkey/<name>/valkey.conf --supervised systemd
ExecStop=<cli-binary> -a <pass> -h 127.0.0.1 -p <port> shutdown nosave
Restart=always
RestartSec=5

DynamicUser=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/patiom/valkey/<name>
NoNewPrivileges=yes
PrivateTmp=yes
RestrictNamespaces=yes

[Install]
WantedBy=multi-user.target
```

Full 7-directive hardening (same as app template).

### CLI

```
patiom valkey create <name> [--maxmemory 64mb] [--aof]
patiom valkey destroy <name>
patiom valkey restart <name>
patiom valkey list                                 # table: name / state / mem / maxmemory / port
patiom valkey attach <app> <name> [--env-var REDIS_URL]
patiom valkey detach <app> <name> [--env-var REDIS_URL]
```

### Install + binary detection

`create` flow:
1. `which valkey-server || which redis-server` — cache resolved path at `/var/lib/patiom/valkey/.binary-path`
2. If neither exists, `apt-get install -y valkey-server`; on package-unavailable (Debian 12, Ubuntu 22.04/24.04), fall back to `apt-get install -y redis-server` (wire-compatible for BullMQ v5+)
3. If neither installs, return `501` with manual instructions

### Destroy behavior

**No guard.** Stops unit, deletes data, removes unit file. Leaves `REDIS_URL` in attached apps' `.env` untouched — user can `detach` or re-attach. No app-state checks.

### Scope estimate

~1.5–2 days. New route, core module, templates, CLI commands, config changes.

---

## Updated roadmap

```
v0.2   cli-table3
       patiom logs
       Server metrics (NDJSON, 60s)
       Per-app metrics (cgroup v2)

v0.3   Cronjobs (systemd timers, cron syntax)

v0.4   Optional Valkey instances (top-level, per-app attach)

v1.0   Web dashboard (full management)
       (stabilization, polish)

v2.0   Backups (local + S3)
       Rollback
       Release pruning
       instances: "maxcpu"

v3.0+  Staging / preview deploys
       Multi-server support
```

---

## New & modified files summary

### New files
```
packages/cli/src/commands/logs.ts          — logs command logic
packages/cli/src/commands/cron.ts          — cron list command
packages/cli/src/commands/valkey.ts        — valkey CLI commands
packages/daemon/src/core/metrics.ts        — server + per-app collection
packages/daemon/src/core/timers.ts         — cron→OnCalendar converter
packages/daemon/src/core/valkey.ts         — valkey lifecycle, install, config
packages/daemon/src/routes/metrics.ts      — metrics API endpoints
packages/daemon/src/routes/valkey.ts       — valkey API endpoints
packages/daemon/src/templates/valkey.ts    — valkey systemd unit + valkey.conf templates
```

### Modified files
```
packages/cli/package.json                      — add cli-table3
packages/cli/src/index.ts                      — register logs, cron, valkey commands
packages/cli/src/commands/status.ts            — use cli-table3
packages/cli/src/commands/token.ts             — use cli-table3
packages/cli/src/commands/db.ts                — use cli-table3
packages/daemon/src/server.ts                  — mount metrics + valkey routes, start collection
packages/daemon/src/routes/apps.ts             — add /logs endpoint
packages/daemon/src/routes/deploy.ts           — create timer units on deploy
packages/daemon/src/templates/systemd.ts       — add timer + one-shot service templates
packages/daemon/src/config.ts                  — add CACHE_DIR, METRICS_DIR, RETENTION_DAYS, VALKEY_DIR, DEFAULT_MAXMEMORY
```

### New dependencies
```
packages/cli:      cli-table3
packages/daemon:   (none — valkey-server/redis-server installed via apt lazily)
```

### New API endpoints
```
GET  /apps/:name/logs             Runtime logs (init + cursor follow)
GET  /metrics/server              Server CPU/mem/load/disk over time
GET  /metrics/apps/:name          Per-app per-instance CPU/mem over time
POST /valkey                      Create Valkey instance
GET  /valkey                      List all Valkey instances
GET  /valkey/:name                Status of one Valkey instance
DELETE /valkey/:name              Destroy Valkey instance
POST /valkey/:name/restart        Restart Valkey instance
POST /valkey/:name/attach         Attach Valkey to app (inject REDIS_URL)
POST /valkey/:name/detach         Detach Valkey from app (remove REDIS_URL)
```

### New CLI commands
```
patiom logs [app] [--follow|-f] [--lines <n>] [--port <p>]
patiom cron list [--app <name>]
patiom valkey create <name> [--maxmemory 64mb] [--aof]
patiom valkey destroy <name>
patiom valkey restart <name>
patiom valkey list
patiom valkey attach <app> <name> [--env-var REDIS_URL]
patiom valkey detach <app> <name> [--env-var REDIS_URL]
```

---

## Recent changes to existing code

### npm install flags (pm.ts)

Added `--no-audit --no-fund --prefer-offline --cache /var/lib/patiom/cache/npm` to all `npm ci` and `npm install` calls in `pm.ts`.

- `--no-audit` / `--no-fund` — skip registry pings for security advisories and funding messages, saves 1–3s per install
- `--prefer-offline` — use locally cached packages when available, only fetch from registry on cache miss
- `--cache /var/lib/patiom/cache/npm` — persistent cache location (npm defaults to `~/.npm` which is ephemeral under some setups)

Cache dir is `mkdir`'d at the start of `install()` and managed via `CACHE_DIR` in `config.ts`.

## Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Logs streaming | Polling every 2s | Matches deploy-log polling. Simpler than SSE. |
| Metrics retention | 365 days, configurable via `METRICS_RETENTION_DAYS` env var | Long history for trends. Config knob is cheap. |
| Per-app granularity | Per-instance (per-port) | Useful for multi-instance deploys — see if one instance is overloaded. |
| Dashboard scope | Full management | Can manage everything CLI can do. But deferred — far from ready. |
| Dashboard hosting | TBD (`dash.patiom.dev` or `patiom studio` CLI command) | Will decide when we implement. |
| Dashboard auth | Login form | Clean URLs, token never in browser history. |
| NDJSON format | JSON-lines-per-minute, daily files | Simple, grepable, gz-able. No dependency. |
| cgroup path | v2 primary, v1 fallback | Modern servers use v2. v1 fallback for compatibility. |
| Cron configuration | In `package.json` under `patiom.cron` | Zero proprietary config files. Matches `domains`, `include`, etc. |
| Cron scheduling syntax | Standard cron (5 fields) → systemd `OnCalendar=` | Cron is what users know. Power users can use raw `OnCalendar=` via `timer` field. |
| Cron runtime | One-shot systemd service per task | Same DynamicUser, WorkingDirectory, EnvironmentFile as main app. Timer fires once regardless of instance count. |
| Valkey topology | Top-level instances, decoupled from apps | Apps attach via `patiom valkey attach`; multiple apps can share one Valkey for worker+web pattern. |
| Valkey binding | Loopback TCP (`127.0.0.1:<port>`) + random `requirepass` | Avoids DynamicUser Unix-socket perm issues (two random UIDs can't share a socket). Loopback + password is equivalent security. |
| Valkey isolation | Per-instance systemd unit, 7 hardening directives | Same isolation model as app instances (DynamicUser, ProtectSystem, etc.). |
| Valkey install | Lazy on first `patiom valkey create` | Base footprint stays lean for users who never need queues. |
| Queue library | None — BullMQ (Valkey) or workmatic (SQLite) | Patiom does lifecycle, not queue R&D. BullMQ is the industry standard (6.5M/week). |
