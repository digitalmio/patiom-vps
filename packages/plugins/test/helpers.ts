import { GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";

export const schema = new GraphQLSchema({
	query: new GraphQLObjectType({
		name: "Query",
		fields: {
			hello: {
				type: GraphQLString,
				resolve: () => "world",
			},
			error: {
				type: GraphQLString,
				resolve: () => {
					throw new Error("boom");
				},
			},
		},
	}),
});

export type Posted = {
	url: string;
	token: string;
	body: Record<string, unknown>;
};

export function normalizeOperation(operation: unknown): string {
	return String(operation).replace(/\s+/g, "");
}

export function createMockFetch(records: Posted[]) {
	return async (url: string, init?: RequestInit): Promise<Response> => {
		const token = new Headers(init?.headers).get("Patiom-Token") ?? "";
		const body = JSON.parse(String(init?.body ?? "{}")) as Record<
			string,
			unknown
		>;
		records.push({ url, token, body });
		return new Response(null, { status: 200 });
	};
}

/**
 * Mock fetch that resolves `ok` responses, counting calls. Used for
 * ordering / waitUntil / blocking assertions.
 */
export function createControlledFetch(opts: {
	status?: number;
	delayMs?: number;
	throwOnce?: boolean;
}) {
	const { status = 200, delayMs = 0, throwOnce = false } = opts;
	let calls = 0;
	const fn = async (url: string, init?: RequestInit): Promise<Response> => {
		calls += 1;
		if (delayMs > 0) {
			await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
		}
		if (throwOnce && calls === 1) {
			throw new Error("network down");
		}
		const token = new Headers(init?.headers).get("Patiom-Token") ?? "";
		return new Response(null, {
			status,
			headers: { "x-patiom-url": url, "x-patiom-token": token },
		});
	};
	const wrapped = fn as typeof fn & { calls: number };
	Object.defineProperty(wrapped, "calls", {
		get: () => calls,
	});
	return wrapped;
}

export function baseOptions(records: Posted[]) {
	return {
		token: "test-token",
		endpoint: "http://ingest.local",
		fetch: createMockFetch(records),
		schemaSyncing: false,
	};
}
