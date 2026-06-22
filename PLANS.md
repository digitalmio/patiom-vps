# v0.2 Plan — CLI polish, logs & metrics

## Overview

Four features, implemented in order. The web dashboard is deferred to a later phase.

### Implementation order

| # | Feature | Scope | Dependencies |
|---|---------|-------|-------------|
| 1 | cli-table3 for table display | CLI only | None |
| 2 | `patiom logs` command | Daemon + CLI | None |
| 3 | Server metrics (CPU/mem/load/disk → NDJSON) | Daemon only | None |
| 4 | Per-app metrics (per-instance CPU/mem via cgroup v2) | Daemon only | Item 3 (shared module) |
| 5 | Web dashboard | **Deferred** | All above |

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

**Will not be implemented in this phase.** The four features above must ship first.

---

## New & modified files summary

### New files
```
packages/cli/src/commands/logs.ts          — logs command logic
packages/daemon/src/core/metrics.ts        — server + per-app collection
packages/daemon/src/routes/metrics.ts      — metrics API endpoints
```

### Modified files
```
packages/cli/package.json                      — add cli-table3
packages/cli/src/index.ts                      — register logs command
packages/cli/src/commands/status.ts            — use cli-table3
packages/cli/src/commands/token.ts             — use cli-table3
packages/cli/src/commands/db.ts                — use cli-table3
packages/daemon/src/server.ts                  — mount metrics route, start collection
packages/daemon/src/routes/apps.ts             — add /logs endpoint
packages/daemon/src/config.ts                  — add METRICS_DIR, RETENTION_DAYS
```

### New dependencies
```
packages/cli:      cli-table3
packages/daemon:   (none)
```

### New API endpoints
```
GET /apps/:name/logs            Runtime logs (init + cursor follow)
GET /metrics/server             Server CPU/mem/load/disk over time
GET /metrics/apps/:name         Per-app per-instance CPU/mem over time
```

### New CLI commands
```
patiom logs [app] [--follow|-f] [--lines <n>] [--port <p>]
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
