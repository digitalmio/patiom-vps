import { envelop, useEngine, useSchema } from "@envelop/core";
import { execute, parse, validate } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { usePatiomLogger } from "../src/envelop";
import {
	baseOptions,
	normalizeOperation,
	type Posted,
	schema,
} from "./helpers";

const engine = { execute, parse, validate };

describe("envelop plugin", () => {
	it("logs an executed operation with HTTP info from context", async () => {
		const records: Posted[] = [];
		const getEnveloped = envelop({
			plugins: [
				useSchema(schema),
				useEngine(engine),
				usePatiomLogger(baseOptions(records)),
			],
		});

		const { execute } = getEnveloped();
		const contextValue = {
			request: new Request("http://localhost/graphql", {
				method: "POST",
				headers: { "x-forwarded-for": "1.2.3.4" },
			}),
		};

		const result = await execute({
			schema,
			document: parse("{ hello }"),
			contextValue,
		});

		expect(result.data).toEqual({ hello: "world" });
		expect(records).toHaveLength(1);
		expect(records[0]?.token).toBe("test-token");
		expect(normalizeOperation(records[0]?.body.operation)).toBe("{hello}");
		expect(records[0]?.body.method).toBe("POST");
		expect(records[0]?.body.ip).toBe("1.2.3.4");
		expect(records[0]?.body.responseHash).toBeTypeOf("number");
		expect(records[0]?.body.elapsed).toBeTypeOf("number");
		expect(records[0]?.body.statusCode).toBe(200);
	});

	it("logs errors returned by the execution", async () => {
		const records: Posted[] = [];
		const getEnveloped = envelop({
			plugins: [
				useSchema(schema),
				useEngine(engine),
				usePatiomLogger(baseOptions(records)),
			],
		});

		const { execute } = getEnveloped();
		await execute({
			schema,
			document: parse("{ error }"),
			contextValue: {
				request: new Request("http://localhost/graphql", { method: "POST" }),
			},
		});

		expect(records).toHaveLength(1);
		expect(records[0]?.body.errors).toBeDefined();
	});

	it("does not log when the context has no request", async () => {
		const records: Posted[] = [];
		const getEnveloped = envelop({
			plugins: [
				useSchema(schema),
				useEngine(engine),
				usePatiomLogger(baseOptions(records)),
			],
		});

		const { execute } = getEnveloped();
		await execute({ schema, document: parse("{ hello }") });

		expect(records).toHaveLength(0);
	});

	it("uses a custom getHttp extractor", async () => {
		const records: Posted[] = [];
		const getEnveloped = envelop({
			plugins: [
				useSchema(schema),
				useEngine(engine),
				usePatiomLogger({
					...baseOptions(records),
					getHttp: () => ({
						headers: {
							get: () => null,
							has: () => false,
						},
						method: "GET",
					}),
				}),
			],
		});

		const { execute } = getEnveloped();
		await execute({ schema, document: parse("{ hello }") });

		expect(records).toHaveLength(1);
		expect(records[0]?.body.method).toBe("GET");
		expect(records[0]?.body.ip).toBeUndefined();
	});

	it("syncs the schema when schemaSyncing is enabled", async () => {
		const records: Posted[] = [];
		envelop({
			plugins: [
				useSchema(schema),
				useEngine(engine),
				usePatiomLogger({
					...baseOptions(records),
					schemaSyncing: true,
					schemaSyncDelay: 0,
				}),
			],
		});

		await vi.waitFor(() => {
			expect(records.some((r) => r.url.endsWith("/api/ingest/schema"))).toBe(
				true,
			);
		});

		const schemaPost = records.find((r) =>
			r.url.endsWith("/api/ingest/schema"),
		);
		expect(schemaPost?.token).toBe("test-token");
		expect(schemaPost?.body).toHaveProperty("schema");
	});
});
