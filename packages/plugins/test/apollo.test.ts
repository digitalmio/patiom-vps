import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { describe, expect, it } from "vitest";
import { createPatiomLoggerPlugin } from "../src/apollo";
import { baseOptions, type Posted, schema } from "./helpers";

describe("apollo server plugin", () => {
	it("logs a request through a real Apollo Server", async () => {
		const records: Posted[] = [];
		const server = new ApolloServer({
			schema,
			plugins: [createPatiomLoggerPlugin(baseOptions(records))],
		});

		const { url } = await startStandaloneServer(server, {
			listen: { port: 0 },
		});

		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-forwarded-for": "5.6.7.8",
				},
				body: JSON.stringify({ query: "{ hello }" }),
			});

			expect(await res.json()).toEqual({ data: { hello: "world" } });

			expect(records).toHaveLength(1);
			expect(records[0]?.token).toBe("test-token");
			expect(records[0]?.body.operation).toBe("{ hello }");
			expect(records[0]?.body.method).toBe("POST");
			expect(records[0]?.body.ip).toBe("5.6.7.8");
			expect(records[0]?.body.statusCode).toBe(200);
		} finally {
			await server.stop();
		}
	});

	it("reports statusCode 400 for validation errors", async () => {
		const records: Posted[] = [];
		const server = new ApolloServer({
			schema,
			plugins: [createPatiomLoggerPlugin(baseOptions(records))],
		});

		const { url } = await startStandaloneServer(server, {
			listen: { port: 0 },
		});

		try {
			const res = await fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ query: "{ nonexistent }" }),
			});

			const json = (await res.json()) as { errors?: unknown };
			expect(json.errors).toBeDefined();

			expect(records).toHaveLength(1);
			expect(records[0]?.body.statusCode).toBe(400);
		} finally {
			await server.stop();
		}
	});
});
