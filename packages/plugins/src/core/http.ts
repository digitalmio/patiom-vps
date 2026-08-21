import type { Headers } from "./types";

export type HttpInfo = {
	headers: Headers;
	method: string;
	responseHeaders?: Headers;
	hasSetCookie?: boolean;
	graphqlClientName?: string;
	graphqlClientVersion?: string;
};

export type GetHttp = (context: unknown) => HttpInfo | undefined;

/**
 * Default HTTP extraction for servers that expose the Fetch `Request` inside
 * the GraphQL context (GraphQL Yoga, and any envelop-based server that does
 * the same). Returns undefined when the context has no compatible request.
 */
export function getHttpFromContext(context: unknown): HttpInfo | undefined {
	const request = (context as { request?: Request })?.request;
	if (
		!request ||
		typeof request.method !== "string" ||
		typeof request.headers?.get !== "function"
	) {
		return undefined;
	}

	const responseHeaders = (request as { responseHeaders?: Headers })
		.responseHeaders;

	return {
		headers: request.headers,
		method: request.method,
		responseHeaders,
		hasSetCookie: responseHeaders?.has("set-cookie"),
		graphqlClientName:
			request.headers.get("x-graphql-client-name") ?? undefined,
		graphqlClientVersion:
			request.headers.get("x-graphql-client-version") ?? undefined,
	};
}
