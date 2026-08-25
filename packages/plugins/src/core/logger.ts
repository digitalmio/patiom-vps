import { type GraphQLSchema, introspectionFromSchema } from "graphql";
import { extractPatiomPayload } from "./payload";
import type { PatiomLoggerOptions, PatiomPayloadOptions } from "./types";

export type Logger = {
	fetch: typeof fetch;
	token: string;
	endpoint: string;
	sendSchema(schema: GraphQLSchema): Promise<void>;
	stop(): void;
	log(options: PatiomPayloadOptions): Promise<void>;
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

type AttemptResult = "success" | "retryable" | "fatal";

/**
 * Send a single ingest POST. Returns whether the outcome is retryable.
 * Never rejects — failures are surfaced via `console.warn` by the caller.
 */
async function attemptOnce(options: {
	fetch: typeof fetch;
	url: string;
	body: string;
	token: string;
	timeoutMs?: number;
}): Promise<AttemptResult> {
	const { fetch, url, body, token, timeoutMs } = options;
	const signal = timeoutMs != null ? AbortSignal.timeout(timeoutMs) : undefined;
	try {
		const res = await fetch(url, {
			method: "POST",
			body,
			headers: {
				"Content-Type": "application/json",
				"Patiom-Token": token,
			},
			signal,
		});
		if (res.ok) return "success";
		if (res.status >= 500) return "retryable";
		return "fatal";
	} catch (_error) {
		return "retryable";
	}
}

/**
 * Send an ingest POST with optional one-shot retry.
 * - `retry: true`  → on network error / 5xx, try once more, then warn.
 * - `retry: false` → fail fast (blocking mode), warn immediately.
 * - 4xx is never retried (a bad token won't heal).
 * Never rejects; resolves once the final outcome is reached.
 */
async function sendWithRetry(options: {
	fetch: typeof fetch;
	url: string;
	body: string;
	token: string;
	retry: boolean;
	timeoutMs?: number;
	label: string;
}): Promise<void> {
	const { retry, label } = options;
	const warn = (detail: string) =>
		console.warn(`Patiom: failed to send ${label}`, detail);

	const first = await attemptOnce(options);
	if (first === "success") return;
	if (first === "fatal") {
		warn("non-retryable error");
		return;
	}
	if (!retry) {
		warn("network or server error");
		return;
	}
	const second = await attemptOnce(options);
	if (second === "success") return;
	warn(
		second === "fatal" ? "non-retryable error on retry" : "failed after retry",
	);
}

function createSchemaSyncer(options: {
	fetch: typeof fetch;
	token: string;
	endpoint: string;
	shouldSyncSchema: boolean;
	schemaSyncDelay: number;
	flush: "background" | "blocking";
	waitUntil?: (promise: Promise<unknown>) => void;
	sendTimeoutMs?: number;
}) {
	let stopped = false;
	let timeout: ReturnType<typeof setTimeout> | null = null;
	const {
		fetch,
		token,
		endpoint,
		shouldSyncSchema,
		schemaSyncDelay,
		flush,
		waitUntil,
		sendTimeoutMs,
	} = options;

	const sendImmediately = (introspection: unknown): Promise<void> => {
		const retry = flush !== "blocking";
		const timeoutMs = flush === "blocking" ? sendTimeoutMs : undefined;
		const promise = sendWithRetry({
			fetch,
			url: `${endpoint}/api/ingest/schema`,
			body: JSON.stringify({ schema: introspection }),
			token,
			retry,
			timeoutMs,
			label: "schema sync",
		});
		if (waitUntil) {
			waitUntil(promise.catch(() => {}));
			return Promise.resolve();
		}
		return promise;
	};

	const sendSchema = async (schema: GraphQLSchema): Promise<void> => {
		if (!shouldSyncSchema) return;

		const introspection = introspectionFromSchema(schema);

		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}

		if (waitUntil || flush === "blocking") {
			await sendImmediately(introspection);
			return;
		}

		timeout = setTimeout(() => {
			timeout = null;
			if (stopped) return;
			void sendWithRetry({
				fetch,
				url: `${endpoint}/api/ingest/schema`,
				body: JSON.stringify({ schema: introspection }),
				token,
				retry: true,
				label: "schema sync",
			});
		}, schemaSyncDelay);
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
	const flush = options.flush ?? "background";
	const waitUntil = options.waitUntil;
	const sendTimeoutMs = options.sendTimeoutMs ?? 2000;

	warnFetch(fetch);

	const { sendSchema, stop } = createSchemaSyncer({
		fetch,
		token: options.token,
		endpoint,
		shouldSyncSchema,
		schemaSyncDelay: options.schemaSyncDelay ?? Math.random() * 5000,
		flush,
		waitUntil,
		sendTimeoutMs,
	});

	return {
		fetch,
		token: options.token,
		endpoint,
		sendSchema,
		stop,
		async log(payloadOptions) {
			const payload = extractPatiomPayload({
				...payloadOptions,
				sendVariablesAsHash,
			});
			const retry = flush !== "blocking";
			const timeoutMs = flush === "blocking" ? sendTimeoutMs : undefined;
			const promise = sendWithRetry({
				fetch,
				url: `${endpoint}/api/ingest/log`,
				body: JSON.stringify(payload),
				token: options.token,
				retry,
				timeoutMs,
				label: "log",
			});
			if (waitUntil) {
				waitUntil(promise.catch(() => {}));
				return;
			}
			if (flush === "blocking") {
				await promise;
				return;
			}
			promise.catch(() => {});
		},
	};
}
