# Migrating from Stellate GraphQL Metrics

Patiom's ingestion API is **wire-compatible with the Stellate metrics plugins**
(`stellate` npm package). If you already use a Stellate plugin (Apollo Server,
GraphQL Yoga, GraphQL Mesh, Envelop), you can switch to Patiom without touching
your GraphQL server logic or losing historical data shapes.

## Quick start

Change two things in your existing Stellate plugin setup:

1. **Wrap `fetch`** so requests go to Patiom instead of Stellate
2. **Use your Patiom ingestion token** (Projects → your project → API keys)

```js
import { createStellateLoggerPlugin } from "stellate/graphql-yoga";
import { createServer } from "node:http";
import { createYoga } from "graphql-yoga";

const patiomFetch = (url, init) =>
	fetch(String(url).replace(/^https:\/\/[^/]+/, "https://ingest.patiom.dev"), init);

const stellatePlugin = createStellateLoggerPlugin({
	serviceName: "anything", // ignored by Patiom
	token: "ptm_your_ingestion_token",
	fetch: patiomFetch, // works in Node (node-fetch) and edge runtimes
});

const yoga = createYoga({ schema, plugins: [stellatePlugin] });
```

That's it. Schema sync and request logging both flow to Patiom.

## What's supported

Every field of the Stellate logging payload is supported:

| Stellate field | Patiom handling |
| --- | --- |
| `operation`, `operationName`, `method` | stored as-is |
| `variables` / `variableHash` | hashed with the same djb2 algorithm; `variablesHash` (docs name) is accepted too |
| `ip` | resolved to country + city server-side (IPLocate, DB-cached), then **replaced with its SHA-256 hash** — the raw address is never stored |
| `errors` | stored per-request, aggregated into error analytics |
| `responseSize`, `responseHash`, `elapsed` | stored as-is; latency percentiles computed |
| `statusCode`, `hasSetCookie`, `referer`, `userAgent` | stored as-is; UA parsed into browser/OS/platform |
| `graphqlClientName`, `graphqlClientVersion` | stored as-is (from `x-graphql-client-name`/`-version` headers) |
| `varyHash` | stored as-is |

Plus one Patiom addition: the plugin's schema sync creates a schema version and
every log is attributed to the **exact schema version** that served the request
(safe under rolling deploys).

## Endpoint contract

| Route | Auth header | Body | Success |
| --- | --- | --- | --- |
| `POST /log` | `Stellate-Logging-Token` | Stellate logging payload | `204` |
| `POST /schema` | `Stellate-Schema-Token` | `{ "schema": introspection }` | `204` |

Errors: `401` for a missing/invalid token, `400` for an invalid JSON body.

## Verified competitive facts

All claims below are sourced; do not state them without a source.

| Claim | Source |
| --- | --- |
| The Guild acquired Stellate (Sep 2024); the Metrics product is being merged into GraphQL Hive, the CDN continues under The Guild | [stellate.co/blog/stellate-has-been-acquired](https://stellate.co/blog/stellate-has-been-acquired), [the-guild.dev announcement](https://the-guild.dev/graphql/hive/blog/stellate-acquisition) |
| The `stellate` client plugin sends the **raw IP** (`x-forwarded-for[0]` → `true-client-ip` → `x-real-ip`) in the `/log` payload; the only client-side hashing is djb2 (exported as `createBlake3Hash`) over variables/response/field values | `stellate@3.2.28` dist source (`dist/graphql-yoga.js` et al.) |
| Stellate's server **hashes the IP with SHA-256 before storing** | [Metrics Logging API docs](https://stellate.co/docs/reference/logging), `ip` field note |
| Stellate never stores variable values (replaced by names; hard-coded arguments converted to variables) | [Query Anonymization docs](https://stellate.co/docs/graphql-metrics/query-anonymization) |
| Stellate's geo dimensions are **country + continent only — no city** (also `edgeLocation`/`region`, which are their edge PoPs, not client geo) | live introspection of `graph.stellate.co` (Public API schema): `Metrics.byCountry`, `Metrics.byContinent`; no city field exists |
| The IP→geo provider Stellate uses server-side is **not publicly known** (closed source; their edge runs on Cloudflare, so edge-derived geo is plausible but unverified) | — |

Patiom differentiators that fall out of this: country + **city** geo resolution
(and lat/long), per-request **schema version** attribution, and privacy parity —
Patiom's SHA-256 IP handling matches Stellate's documented behavior.

## Privacy note

Your server forwards end-user IP addresses from your own request headers
(`x-forwarded-for` / `true-client-ip` / `x-real-ip`). Geo resolution happens
entirely on Patiom's infrastructure — your server only includes the IP string
it already received, and no geo credentials ever touch it.

**Patiom never stores raw IP addresses.** Each IP is resolved to
country/city and then replaced with its SHA-256 hash before persisting —
you keep location analytics and distinct-visitor counts, and no PII
address is ever written to storage.

For stricter setups, pass `anonymize: true` when creating the logger
plugin: argument values and aliases are stripped from the operation text
on your server, before anything leaves it. Selection structure is
preserved, so field-usage analytics keep working. Ensure your privacy
policy covers sharing visitor data with a third-party analytics processor.
