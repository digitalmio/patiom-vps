import { createYoga } from "graphql-yoga";
import { describe, expect, it } from "vitest";
import { createPatiomYogaPlugin } from "../src/graphql-yoga";
import {
	baseOptions,
	normalizeOperation,
	type Posted,
	schema,
} from "./helpers";

describe("graphql-yoga plugin", () => {
	it("logs a request/response through Yoga", async () => {
		const records: Posted[] = [];
		const yoga = createYoga({
			schema,
			plugins: [createPatiomYogaPlugin(baseOptions(records))],
		});

		const res = await yoga.fetch("http://localhost/graphql", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-forwarded-for": "9.9.9.9",
			},
			body: JSON.stringify({ query: "{ hello }" }),
		});

		expect(await res.json()).toEqual({ data: { hello: "world" } });

		expect(records).toHaveLength(1);
		expect(records[0]?.token).toBe("test-token");
		expect(normalizeOperation(records[0]?.body.operation)).toBe("{hello}");
		expect(records[0]?.body.method).toBe("POST");
		expect(records[0]?.body.ip).toBe("9.9.9.9");
		expect(records[0]?.body.variables).toBeUndefined();
		expect(records[0]?.body.statusCode).toBe(200);
	});

	it("logs errors from a failing operation", async () => {
		const records: Posted[] = [];
		const yoga = createYoga({
			schema,
			plugins: [createPatiomYogaPlugin(baseOptions(records))],
		});

		await yoga.fetch("http://localhost/graphql", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ query: "{ error }" }),
		});

		expect(records).toHaveLength(1);
		expect(records[0]?.body.errors).toBeDefined();
	});
});
