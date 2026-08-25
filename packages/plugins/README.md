# @patiom/client

Patiom logging plugins for popular GraphQL servers. Send operation, performance
and field-usage telemetry to [Patiom](https://patiom.dev) from your GraphQL API.

## Install

```bash
pnpm add @patiom/client
# or
npm install @patiom/client
```

Each plugin is published as a separate entrypoint. Install the server library
you already use alongside it (e.g. `graphql-yoga`, `@apollo/server`, etc.).

## Usage

### Apollo Server

```ts
import { ApolloServer } from "@apollo/server";
import { createPatiomLoggerPlugin } from "@patiom/client/apollo-server";

const server = new ApolloServer({
  schema,
  plugins: [createPatiomLoggerPlugin({ token: "your-api-token" })],
});
```

### GraphQL Yoga

```ts
import { createYoga } from "graphql-yoga";
import { createPatiomYogaPlugin } from "@patiom/client/graphql-yoga";

const yoga = createYoga({
  schema,
  plugins: [createPatiomYogaPlugin({ token: "your-api-token" })],
});
```

### Envelop (covers GraphQL Helix and any envelop-based server)

```ts
import { envelop, useSchema, useEngine } from "@envelop/core";
import { execute, parse, validate } from "graphql";
import { usePatiomLogger } from "@patiom/client/envelop";

const getEnveloped = envelop({
  plugins: [
    useSchema(schema),
    useEngine({ execute, parse, validate }),
    usePatiomLogger({ token: "your-api-token" }),
  ],
});
```

### Mercurius (Fastify)

```ts
import Fastify from "fastify";
import mercurius from "mercurius";
import { createPatiomMercuriusPlugin } from "@patiom/client/mercurius";

const app = Fastify();
await app.register(mercurius, { schema: typeDefs, resolvers });

const patiom = createPatiomMercuriusPlugin({ token: "your-api-token" });
await patiom.register(app);
```

### graphql-http

```ts
import { createHandler } from "graphql-http/lib/use/fetch";
import { usePatiomGraphqlHttp } from "@patiom/client/graphql-http";

const handler = createHandler({
  schema,
  context: (req) => ({ request: req }),
  ...usePatiomGraphqlHttp({ token: "your-api-token" }),
});
```

Or wrap the handler directly to capture the full HTTP request/response:

```ts
import { createHandler } from "graphql-http/lib/use/fetch";
import { withPatiomLogger } from "@patiom/client/graphql-http";

const handler = withPatiomLogger(createHandler({ schema }), {
  token: "your-api-token",
});
```

## Options

All plugins accept the same options object:

| Option               | Type     | Default                    | Description                                            |
| -------------------- | -------- | -------------------------- | ------------------------------------------------------ |
| `token`              | `string` | _(required)_               | Your Patiom project API token                          |
| `endpoint`           | `string` | `process.env.PATIOM_ENDPOINT` or `https://ingest.patiom.dev` | Ingest endpoint override |
| `fetch`              | `fn`     | `globalThis.fetch`         | Fetch implementation used for ingest requests          |
| `sendVariablesAsHash`| `boolean`| `true`                     | Send a hash of variables instead of raw values         |
| `schemaSyncing`      | `boolean`| `true`                     | Send the GraphQL schema to Patiom                      |
| `schemaSyncDelay`    | `number` | random 0-5000ms            | Debounce delay (ms) before the schema sync (background mode only) |
| `flush`              | `"background" \| "blocking"` | `"background"` | Delivery mode — see [Serverless & delivery](#serverless--delivery) |
| `waitUntil`          | `fn`     | _none_                     | Cloudflare Workers `ctx.waitUntil` — lossless, zero-latency |
| `sendTimeoutMs`      | `number` | `2000`                     | Per-attempt timeout (ms) in `blocking` mode            |

The ingest endpoint is resolved as: `endpoint` option → `PATIOM_ENDPOINT` env
var (a full URL) → `https://ingest.patiom.dev`.

## Serverless & delivery

Patiom ships three delivery modes so you can match your runtime's lifecycle.
**Precedence:** `waitUntil` (if provided) > `flush: "blocking"` > `background`.

| Mode | Schema sync | Log send | Retry | Best for |
| --- | --- | --- | --- | --- |
| `background` (default) | debounced timer | fire-and-forget | 1 retry on network/5xx + `console.warn` | Long-lived servers (Node, containers) |
| `waitUntil` (Workers) | immediate, via `waitUntil` | via `waitUntil` | 1 retry + `console.warn` | **Cloudflare Workers** — lossless, zero added latency |
| `flush: "blocking"` | immediate, awaited | awaited before response | no retry (fail fast) + `console.warn` | Lambda / containers that freeze after the handler returns |

**Cloudflare Workers** — pass `ctx.waitUntil`. The ingest POSTs are routed
through it, keeping the event alive to completion with **no added response
latency**:

```ts
export default {
  fetch(request, env, ctx) {
    return yoga.fetch(request, env, ctx);
  },
};

createPatiomYogaPlugin({
  token: env.PATIOM_TOKEN,
  waitUntil: (promise) => ctx.waitUntil(promise),
});
```

**AWS Lambda / containers without `waitUntil`** — use `flush: "blocking"`. The
plugin awaits the ingest POST before the GraphQL response is finalized, so logs
survive runtime freeze. `sendTimeoutMs` (default 2000) bounds the worst-case
added latency if ingest is slow or unreachable. Blocking mode does **not** retry
— it fails fast to protect your API's latency:

```ts
createPatiomYogaPlugin({
  token: process.env.PATIOM_TOKEN,
  flush: "blocking",
  sendTimeoutMs: 2000,
});
```

> **Warning:** in `blocking` mode your response latency depends on ingest
> availability. Prefer `waitUntil` on Cloudflare Workers.

Schema sync is unconditional in `waitUntil`/`blocking` modes (sent on first
request, no debounce timer) — repeated cold starts re-send the schema, but the
ingest side hash-deduplicates it. The random `schemaSyncDelay` debounce only
applies to `background` mode, where it prevents thundering herds across many
server instances restarting together.

## Envelop-specific options

`usePatiomLogger` and `usePatiomGraphqlHttp` accept an optional `getHttp`
callback to extract HTTP request info from the GraphQL context:

```ts
usePatiomLogger({
  token: "your-api-token",
  getHttp: (context) => context.request, // default
});
```

## License

Apache-2.0

## Publishing

```bash
pnpm --filter @patiom/client publish
```

Runs typecheck, tests and the build via `prepublishOnly` before packing. No
`repository` field is published - this package is distributed from a private
monorepo.
