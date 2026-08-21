import {
	type GraphQLError,
	type GraphQLSchema,
	introspectionFromSchema,
} from "graphql";
import { extractPatiomPayload } from "./payload";
import type {
	Headers,
	PatiomLoggerOptions,
	PatiomPayload,
	PatiomPayloadOptions,
} from "./types";

export type Logger = {
	fetch: typeof fetch;
	token: string;
	endpoint: string;
	sendSchema(schema: GraphQLSchema): void;
	stop(): void;
	log(options: PatiomPayloadOptions): void;
};

/**
 * Resolve the ingest endpoint. Priority:
 * 1. explicit `endpoint` option
 * 2. `PATIOM_ENDPOINT` env var (if it looks like a URL)
 * 3. production default
 */
export function resolveEndpoint(options?: { endpoint?: string }): string {
	if (options?.endpoint) return options.endpoint;
	const env =
		typeof process !== "undefined" ? process.env?.PATIOM_ENDPOINT : undefined;
	if (env?.startsWith("http")) return env;
	return "https://ingest.patiom.dev";
}

function warnFetch(fetchFn: unknown): void {
	if (typeof fetchFn !== "function") {
		console.warn(
			"Patiom logger plugin requires a fetch function to be provided as an option.",
		);
	}
}

async function sendLog(options: {
	fetch: typeof fetch;
	payload: PatiomPayload;
	token: string;
	endpoint: string;
}): Promise<Response> {
	return options.fetch(`${options.endpoint}/api/ingest/log`, {
		method: "POST",
		body: JSON.stringify(options.payload),
		headers: {
			"Content-Type": "application/json",
			"Patiom-Token": options.token,
		},
	});
}

function createSchemaSyncer(options: {
	fetch: typeof fetch;
	token: string;
	endpoint: string;
	shouldSyncSchema: boolean;
}) {
	let stopped = false;
	let timeout: ReturnType<typeof setTimeout> | null = null;
	const { fetch, token, endpoint, shouldSyncSchema } = options;

	const sendSchema = (schema: GraphQLSchema): void => {
		if (!shouldSyncSchema) return;

		const introspection = introspectionFromSchema(schema);

		if (timeout) {
			clearTimeout(timeout);
		}

		timeout = setTimeout(async () => {
			timeout = null;

			if (stopped) return;

			try {
				await fetch(`${endpoint}/api/ingest/schema`, {
					method: "POST",
					body: JSON.stringify({ schema: introspection }),
					headers: {
						"Content-Type": "application/json",
						"Patiom-Token": token,
					},
				});
			} catch (_error) {
				// Silently fail - schema sync shouldn't break the application
			}
		}, Math.random() * 5000);
	};

	const stop = (): void => {
		stopped = true;
		if (timeout) {
			clearTimeout(timeout);
		}
	};

	return { sendSchema, stop };
}

export function createPatiomLogger(options: PatiomLoggerOptions): Logger {
	const fetch = options.fetch ?? globalThis.fetch;
	const endpoint = resolveEndpoint(options);
	const sendVariablesAsHash = options.sendVariablesAsHash ?? true;
	const shouldSyncSchema = options.schemaSyncing ?? true;

	warnFetch(fetch);

	const { sendSchema, stop } = createSchemaSyncer({
		fetch,
		token: options.token,
		endpoint,
		shouldSyncSchema,
	});

	return {
		fetch,
		token: options.token,
		endpoint,
		sendSchema,
		stop,
		log(payloadOptions) {
			const payload = extractPatiomPayload({
				...payloadOptions,
				sendVariablesAsHash,
			});
			sendLog({ fetch, payload, token: options.token, endpoint }).catch(
				() => {},
			);
		},
	};
}

export type { Headers };
export type { GraphQLError };
