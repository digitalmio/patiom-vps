import { GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { createPatiomLogger } from "../src/core/logger";
import { baseOptions, createControlledFetch, type Posted } from "./helpers";

function makeLogger(overrides: Record<string, unknown> = {}) {
	const records: Posted[] = [];
	const opts = { ...baseOptions(records), ...overrides } as Parameters<
		typeof createPatiomLogger
	>[0];
	return { records, logger: createPatiomLogger(opts) };
}

function logPayload(logger: ReturnType<typeof createPatiomLogger>) {
	return logger.log({
		headers: new Headers(),
		operation: "{ hello }",
		method: "POST",
		start: Date.now(),
		response: { data: { hello: "world" } },
		statusCode: 200,
	});
}

function flush() {
	return new Promise<void>((r) => setTimeout(r, 10));
}

describe("delivery: background mode (default)", () => {
	it("fire-and-forget: log() resolves before fetch completes", async () => {
		const fetch = createControlledFetch({ delayMs: 50 });
		const { logger } = makeLogger({ fetch });
		let resolved = false;
		const p = logPayload(logger);
		p.then(() => {
			resolved = true;
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(resolved).toBe(true);
		await p;
		expect(fetch.calls).toBe(1);
	});

	it("retries once on 5xx then warns", async () => {
		const fetch = createControlledFetch({ status: 503 });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { logger } = makeLogger({ fetch });
		await logPayload(logger);
		await flush();
		expect(fetch.calls).toBe(2);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("does not retry on 4xx (fatal)", async () => {
		const fetch = createControlledFetch({ status: 401 });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { logger } = makeLogger({ fetch });
		await logPayload(logger);
		await flush();
		expect(fetch.calls).toBe(1);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("retries once on transient network error then succeeds", async () => {
		const fetch = createControlledFetch({ throwOnce: true });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { logger } = makeLogger({ fetch });
		await logPayload(logger);
		await flush();
		expect(fetch.calls).toBe(2);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe("delivery: waitUntil", () => {
	it("routes the promise through waitUntil and resolves immediately", async () => {
		const fetch = createControlledFetch({ delayMs: 50 });
		const received: Promise<unknown>[] = [];
		const { logger } = makeLogger({
			fetch,
			waitUntil: (p) => received.push(p),
		});
		let resolved = false;
		const p = logPayload(logger);
		p.then(() => {
			resolved = true;
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(resolved).toBe(true);
		expect(received).toHaveLength(1);
		await received[0];
		expect(fetch.calls).toBe(1);
	});
});

describe("delivery: blocking mode", () => {
	it("awaits the fetch before log() resolves", async () => {
		const fetch = createControlledFetch({ delayMs: 30 });
		const { logger } = makeLogger({ fetch, flush: "blocking" });
		let done = false;
		const p = logPayload(logger);
		p.then(() => {
			done = true;
		});
		await new Promise((r) => setTimeout(r, 5));
		expect(done).toBe(false);
		await p;
		expect(done).toBe(true);
		expect(fetch.calls).toBe(1);
	});

	it("fails fast: no retry on 5xx", async () => {
		const fetch = createControlledFetch({ status: 503 });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { logger } = makeLogger({ fetch, flush: "blocking" });
		await logPayload(logger);
		expect(fetch.calls).toBe(1);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe("delivery: schema sync modes", () => {
	const testSchema = new GraphQLSchema({
		query: new GraphQLObjectType({
			name: "Query",
			fields: { hello: { type: GraphQLString, resolve: () => "world" } },
		}),
	});

	it("blocking: sends schema immediately (no timer)", async () => {
		const fetch = createControlledFetch({});
		const { logger } = makeLogger({
			fetch,
			flush: "blocking",
			schemaSyncing: true,
		});
		await logger.sendSchema(testSchema);
		expect(fetch.calls).toBe(1);
	});

	it("waitUntil: sends schema immediately via waitUntil", async () => {
		const fetch = createControlledFetch({});
		const received: Promise<unknown>[] = [];
		const { logger } = makeLogger({
			fetch,
			waitUntil: (p) => received.push(p),
			schemaSyncing: true,
		});
		await logger.sendSchema(testSchema);
		expect(fetch.calls).toBe(1);
		expect(received).toHaveLength(1);
	});

	it("background: defers schema send via timer", async () => {
		const fetch = createControlledFetch({});
		const { logger } = makeLogger({
			fetch,
			schemaSyncing: true,
			schemaSyncDelay: 5,
		});
		await logger.sendSchema(testSchema);
		expect(fetch.calls).toBe(0);
		await new Promise((r) => setTimeout(r, 20));
		expect(fetch.calls).toBe(1);
	});
});
