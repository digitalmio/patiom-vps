import { describe, expect, it } from "vitest";
import { anonymizeQuery } from "../src/core/anonymize";
import { createDjb2Hash } from "../src/core/hash";
import { createPatiomLogger } from "../src/core/logger";
import { baseOptions, type Posted } from "./helpers";

describe("anonymizeQuery", () => {
	it("strips argument values and aliases but keeps selection structure", () => {
		const anonymized = anonymizeQuery(
			'{ user(id: "42", role: ADMIN) { emailAddress: email posts(skip: 5) { title } } }',
		);
		expect(anonymized).not.toContain("42");
		expect(anonymized).not.toContain("ADMIN");
		expect(anonymized).not.toContain("skip");
		expect(anonymized).not.toContain("emailAddress");
		expect(anonymized).toContain("user");
		expect(anonymized).toContain("email");
		expect(anonymized).toContain("posts");
		expect(anonymized).toContain("title");
	});

	it("returns a stable hash placeholder for unparseable operations (never the raw text)", () => {
		const raw = "{ broken query !!!";
		const anonymized = anonymizeQuery(raw);
		expect(anonymized).not.toContain("broken");
		expect(anonymized).toBe(`__anonymized_${createDjb2Hash(raw)}__`);
	});

	it("is deterministic for the same input", () => {
		const query = 'query A { find(q: "secret") { name } }';
		expect(anonymizeQuery(query)).toBe(anonymizeQuery(query));
	});
});

describe("plugin option: anonymize", () => {
	function makeLogger(overrides: Record<string, unknown> = {}) {
		const records: Posted[] = [];
		const opts = { ...baseOptions(records), ...overrides } as Parameters<
			typeof createPatiomLogger
		>[0];
		return { records, logger: createPatiomLogger(opts) };
	}

	async function logOperation(
		logger: ReturnType<typeof createPatiomLogger>,
		operation: string,
	) {
		await logger.log({
			headers: new Headers(),
			operation,
			method: "POST",
			start: Date.now(),
			response: {},
			statusCode: 200,
		});
		await new Promise((r) => setTimeout(r, 10));
	}

	it("sends the anonymized operation when enabled", async () => {
		const { records, logger } = makeLogger({ anonymize: true });
		await logOperation(logger, "query Q($id: ID!) { user(id: $id) { email } }");
		const logPost = records.find((r) => r.url.endsWith("/api/ingest/log"));
		expect(logPost).toBeDefined();
		const operation = logPost?.body.operation as string;
		expect(operation).not.toContain("user(");
		expect(operation).toContain("$id: ID!");
		expect(operation).toContain("user {");
		expect(operation).toContain("email");
	});

	it("sends the raw operation by default", async () => {
		const { records, logger } = makeLogger();
		const raw = "query Q($id: ID!) { user(id: $id) { email } }";
		await logOperation(logger, raw);
		const logPost = records.find((r) => r.url.endsWith("/api/ingest/log"));
		expect(logPost?.body.operation).toBe(raw);
	});
});
