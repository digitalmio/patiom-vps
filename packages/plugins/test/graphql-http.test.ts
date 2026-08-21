import { createHandler } from "graphql-http/lib/use/fetch";
import { describe, expect, it } from "vitest";
import { usePatiomGraphqlHttp, withPatiomLogger } from "../src/graphql-http";
import {
	baseOptions,
	normalizeOperation,
	type Posted,
	schema,
} from "./helpers";

function post(url: string, query: string) {
	return new Request(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-forwarded-for": "2.3.4.5",
		},
		body: JSON.stringify({ query }),
	});
}

describe("graphql-http plugin (execute wrapper)", () => {
	it("logs when the request is exposed via context", async () => {
		const records: Posted[] = [];
		const handler = createHandler({
			schema,
			context: (req) => ({ request: req }),
			...usePatiomGraphqlHttp(baseOptions(records)),
		});

		const res = await handler(post("http://localhost/graphql", "{ hello }"));

		expect(await res.json()).toEqual({ data: { hello: "world" } });

		expect(records).toHaveLength(1);
		expect(records[0]?.token).toBe("test-token");
		expect(normalizeOperation(records[0]?.body.operation)).toBe("{hello}");
		expect(records[0]?.body.method).toBe("POST");
		expect(records[0]?.body.ip).toBe("2.3.4.5");
	});
});

describe("graphql-http plugin (handler wrapper)", () => {
	it("logs the full request/response", async () => {
		const records: Posted[] = [];
		const handler = withPatiomLogger(
			createHandler({ schema }),
			baseOptions(records),
		);

		const res = await handler(post("http://localhost/graphql", "{ hello }"));

		expect(await res.json()).toEqual({ data: { hello: "world" } });

		expect(records).toHaveLength(1);
		expect(records[0]?.body.operation).toBe("{ hello }");
		expect(records[0]?.body.method).toBe("POST");
		expect(records[0]?.body.ip).toBe("2.3.4.5");
		expect(records[0]?.body.statusCode).toBe(200);
	});

	it("logs a GET request with query parameters", async () => {
		const records: Posted[] = [];
		const handler = withPatiomLogger(
			createHandler({ schema }),
			baseOptions(records),
		);

		const res = await handler(
			new Request("http://localhost/graphql?query=%7B%20hello%20%7D", {
				method: "GET",
			}),
		);

		expect(await res.json()).toEqual({ data: { hello: "world" } });

		expect(records).toHaveLength(1);
		expect(records[0]?.body.operation).toBe("{ hello }");
		expect(records[0]?.body.method).toBe("GET");
	});

	it("skips logging when the response body is not JSON", async () => {
		const records: Posted[] = [];
		const stub = (_req: Request) => new Response("not json", { status: 400 });
		const handler = withPatiomLogger(stub, baseOptions(records));

		const res = await handler(post("http://localhost/graphql", "{ hello }"));

		expect(res.status).toBe(400);
		expect(records).toHaveLength(0);
	});
});
