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

export function baseOptions(records: Posted[]) {
	return {
		token: "test-token",
		endpoint: "http://ingest.local",
		fetch: createMockFetch(records),
		schemaSyncing: false,
	};
}
