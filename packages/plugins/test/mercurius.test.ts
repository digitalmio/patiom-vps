import Fastify from "fastify";
import mercurius from "mercurius";
import { describe, expect, it } from "vitest";
import { createPatiomMercuriusPlugin } from "../src/mercurius";
import { baseOptions, type Posted } from "./helpers";

// Mercurius is typically registered with SDL + resolvers (matching real usage);
// this also avoids the vitest "another module or realm" GraphQLSchema check.
const typeDefs = `
	type Query {
		hello: String
		error: String
	}
`;

const resolvers = {
	Query: {
		hello: () => "world",
		error: () => {
			throw new Error("boom");
		},
	},
};

describe("mercurius plugin", () => {
	it("logs a request through Fastify + Mercurius", async () => {
		const records: Posted[] = [];
		const app = Fastify();

		await app.register(mercurius, { schema: typeDefs, resolvers });
		const patiom = createPatiomMercuriusPlugin(baseOptions(records));
		await patiom.register(app);

		const res = await app.inject({
			method: "POST",
			url: "/graphql",
			headers: { "x-forwarded-for": "3.4.5.6" },
			payload: { query: "{ hello }" },
		});

		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ data: { hello: "world" } });

		expect(records).toHaveLength(1);
		expect(records[0]?.token).toBe("test-token");
		expect(String(records[0]?.body.operation).replace(/\s+/g, "")).toBe(
			"{hello}",
		);
		expect(records[0]?.body.method).toBe("POST");
		expect(records[0]?.body.ip).toBe("3.4.5.6");

		patiom.stop();
		await app.close();
	});
});
