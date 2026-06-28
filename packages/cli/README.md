# @patiom/cli

The developer CLI for [Patiom](https://github.com/digitalmio/patiom) — radically simple, containerless, bare-metal deployment for Node.js.

## Install

```bash
npm install -g @patiom/cli
```

## Quick Start

```bash
patiom login --url http://YOUR_SERVER_IP:4000 --token YOUR_TOKEN
cd my-project
patiom init          # adds "patiom" key to package.json
patiom deploy        # build, archive, upload, deploy
```

## Commands

```
patiom login     Link your machine to a Patiom daemon
patiom init      Bootstrap a project for deployment
patiom deploy    Build, zip, and upload your application
patiom status    Show server overview or app details
patiom restart   Restart a service (app, rpxy, or daemon)
patiom logs      View runtime logs from journalctl (--follow to stream)
patiom metrics   Show server or app CPU/memory metrics
patiom db         Manage persistent database files
patiom env         Manage environment variables (set, delete)
patiom token       Manage auth tokens (create, list, revoke)
```

## Full documentation

See the [main README](https://github.com/digitalmio/patiom#readme) for:
- Why Patiom? (vs Docker/Coolify/Dokploy)
- Security model (systemd kernel-level isolation)
- Configuration reference
- Quick Start guide
- Roadmap

## License

ISC
