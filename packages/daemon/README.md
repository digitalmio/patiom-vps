# @patiom/daemon

The server-side agent for [Patiom](https://github.com/digitalmio/patiom) — radically simple, containerless, bare-metal deployment for Node.js.

## What it does

- Manages app releases under `/var/lib/patiom/apps/` with zero-downtime port switching
- Runs apps as isolated systemd processes (`DynamicUser=yes`, `ProtectSystem=strict`, `NoNewPrivileges=yes`, `PrivateTmp=yes`, `RestrictNamespaces=yes`, `ProtectHome=yes`)
- Generates rpxy reverse proxy config with automatic Let's Encrypt certificates
- Collects server-wide + per-app CPU/memory metrics every 60s via cgroup v2, stored as NDJSON
- Provides an HTTP API (port 4000) for the Patiom CLI to deploy, configure, and monitor apps

## Install

Most users install via the bootstrap script (which installs Node, rpxy, and the daemon together):

```bash
curl -sSL https://install.patiom.dev/setup.sh | sudo bash
```

Or install manually:

```bash
npm install -g @patiom/daemon
```

## CLI

```
patiom-server serve                    # start the daemon HTTP server
patiom-server setup --email <email>    # first-time setup (rpxy, ACME, master token)
patiom-server upgrade                  # update to latest version + restart service
```

All commands require root.

## Full documentation

See the [main README](https://github.com/digitalmio/patiom#readme) for:
- Quick Start
- Configuration (`patiom` key in `package.json`)
- Security model (7 systemd hardening directives)
- All CLI commands
- API endpoints
- Roadmap

## License

ISC
