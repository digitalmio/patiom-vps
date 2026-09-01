import type { GraphQLError } from "graphql";

export type Headers = {
	get(name: string): string | null;
	has(name: string): boolean;
};

export type PatiomPayloadOptions = {
	headers: Headers;
	operation: string;
	method: string;
	start: number;
	operationName?: string | null;
	errors?: readonly GraphQLError[] | null;
	response: unknown;
	variables?: Record<string, unknown> | null;
	responseHeaders?: Headers;
	hasSetCookie?: boolean;
	graphqlClientName?: string;
	graphqlClientVersion?: string;
	/** Injected by the logger from the schema syncer — not set by integrations. */
	schemaHash?: number;
	/**
	 * HTTP status code of the response. Defaults to 200 when not provided
	 * (execution-layer integrations like envelop have no response available).
	 */
	statusCode?: number;
	/** Set by the logger from the plugin's `anonymize` option. */
	anonymize?: boolean;
};

export type PatiomPayload = {
	graphqlClientName?: string;
	graphqlClientVersion?: string;
	operation: string;
	operationName?: string | null;
	variables?: Record<string, unknown> | null;
	variableHash?: number;
	/**
	 * djb2 hash of the GraphQL schema introspection this server is currently
	 * running. Lets the ingest pipeline attribute the log to the exact schema
	 * version that served the request (rolling-deploy safe) and wait for that
	 * version to land before processing.
	 */
	schemaHash?: number;
	method: string;
	elapsed: number;
	ip?: string;
	hasSetCookie: boolean;
	referer?: string;
	userAgent?: string;
	statusCode: number;
	errors?: readonly GraphQLError[] | null;
	responseSize: number;
	responseHash: number;
	varyHash?: number;
};

export type PatiomLoggerOptions = {
	fetch?: typeof fetch;
	token: string;
	endpoint?: string;
	sendVariablesAsHash?: boolean;
	/**
	 * Send operations in anonymized form: argument values, aliases and other
	 * literal data are stripped from the query text before it leaves your
	 * server. Field selection structure is preserved, so field-usage
	 * analytics keep working. Variables are still hashed (or hashed only,
	 * see `sendVariablesAsHash`). Defaults to `false`.
	 */
	anonymize?: boolean;
	schemaSyncing?: boolean;
	/**
	 * Debounce delay (ms) before the schema sync request is sent. Only used in
	 * the default `background` flush mode. Defaults to a random 0-5000ms to
	 * avoid thundering herds on server startup. Ignored when `waitUntil` is
	 * provided or `flush` is `"blocking"` (schema is sent immediately).
	 */
	schemaSyncDelay?: number;
	/**
	 * Retry budget for schema sync requests (the schema anchors exact
	 * schema-version attribution of log messages, so it retries more than
	 * logs). Defaults to 4 attempts. Always 1 in `blocking` mode (fail fast).
	 */
	schemaRetryAttempts?: number;
	/**
	 * Delay (ms) between schema sync retry attempts. Defaults to 1000.
	 */
	schemaRetryDelayMs?: number;
	/**
	 * Delivery mode for log and schema payloads.
	 *
	 * - `"background"` (default): fire-and-forget with one retry on network
	 *   error / 5xx and a `console.warn` on final failure. Adds no latency to
	 *   GraphQL responses. Use this on long-lived servers.
	 * - `"blocking"`: await the ingest POST before the GraphQL response is
	 *   finalized. Reliable on runtimes that freeze after the handler returns
	 *   (Lambda, containers) but couples response latency to ingest
	 *   availability. Prefer `waitUntil` on Cloudflare Workers.
	 */
	flush?: "background" | "blocking";
	/**
	 * Cloudflare Workers `ctx.waitUntil` (or compatible). When provided, all
	 * ingest promises are routed through it — lossless at zero added latency.
	 * Takes precedence over `flush`.
	 */
	waitUntil?: (promise: Promise<unknown>) => void;
	/**
	 * Timeout (ms) for each ingest fetch attempt in `blocking` mode. Bounds
	 * worst-case added response latency when ingest is slow or unreachable.
	 * Defaults to 2000. Not applied in `background` or `waitUntil` modes.
	 */
	sendTimeoutMs?: number;
};
