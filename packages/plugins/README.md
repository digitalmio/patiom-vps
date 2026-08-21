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

The ingest endpoint is resolved as: `endpoint` option → `PATIOM_ENDPOINT` env
var (a full URL) → `https://ingest.patiom.dev`.

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
