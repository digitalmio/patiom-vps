import {
	type ExecutionArgs,
	type ExecutionResult,
	type GraphQLError,
	execute as graphqlExecute,
	print,
} from "graphql";
import { type GetHttp, getHttpFromContext } from "./core/http";
import { createPatiomLogger } from "./core/logger";
import type { PatiomLoggerOptions } from "./core/types";

export type GraphqlHttpOptions = PatiomLoggerOptions & {
	/**
	 * Extract HTTP request info from the GraphQL execution context. Defaults to
	 * reading `contextValue.request`. Wire your request into the context (via
	 * graphql-http's `context` option) to capture HTTP-level data.
	 */
	getHttp?: GetHttp;
};

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	return (
		value != null &&
		typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
			"function"
	);
}

/**
 * Execution-layer instrumentation for graphql-http. Spread the returned
 * `execute` into `createHandler({ execute })`:
 *
 *   const handler = createHandler({ schema, ...usePatiomGraphqlHttp({ token }) })
 */
export function usePatiomGraphqlHttp(options: GraphqlHttpOptions): {
	execute: (args: ExecutionArgs) => Promise<ExecutionResult>;
} {
	const logger = createPatiomLogger(options);
	const getHttp = options.getHttp ?? getHttpFromContext;

	return {
		async execute(args) {
			const http = getHttp(args.contextValue);
			const start = Date.now();
			const operation = print(args.document);
			const result = await graphqlExecute(args);

			if (http && !isAsyncIterable(result)) {
				await logger.log({
					headers: http.headers,
					method: http.method,
					start,
					operation,
					operationName: args.operationName,
					errors: (result as ExecutionResult).errors,
					response: result,
					variables: args.variableValues,
					responseHeaders: http.responseHeaders,
					hasSetCookie: http.hasSetCookie,
					graphqlClientName: http.graphqlClientName,
					graphqlClientVersion: http.graphqlClientVersion,
				});
			}

			return result as ExecutionResult;
		},
	};
}

/**
 * Fetch-style handler wrapper for graphql-http. Wrap the handler produced by
 * `createHandler` to capture the full HTTP request/response, including
 * validation errors:
 *
 *   const handler = withPatiomLogger(createHandler({ schema }), { token })
 */
export function withPatiomLogger<
	TArgs extends unknown[],
	THandler extends (...args: TArgs) => Response | Promise<Response>,
>(handler: THandler, options: PatiomLoggerOptions): THandler {
	const logger = createPatiomLogger(options);

	return (async (...args: TArgs) => {
		const request = args[0] as Request;
		const start = Date.now();

		let operation: string | undefined;
		let operationName: string | null | undefined;
		let variables: Record<string, unknown> | null = null;

		try {
			if (request.method === "POST") {
				const text = await request.clone().text();
				const json = JSON.parse(text) as {
					query?: string;
					operationName?: string | null;
					variables?: Record<string, unknown> | null;
				};
				operation = json.query;
				operationName = json.operationName;
				variables = json.variables ?? null;
			} else {
				const url = new URL(request.url);
				operation = url.searchParams.get("query") ?? undefined;
				operationName = url.searchParams.get("operationName");
				const vars = url.searchParams.get("variables");
				variables = vars ? (JSON.parse(vars) as Record<string, unknown>) : null;
			}
		} catch (_error) {
			// Ignore parse failures - nothing to log
		}

		const response = await handler(...args);

		if (operation) {
			let body: unknown;
			try {
				body = await response.clone().json();
			} catch (_error) {
				body = undefined;
			}

			if (body === undefined) {
				return response;
			}

			await logger.log({
				headers: request.headers,
				method: request.method,
				start,
				operation,
				operationName,
				errors: (body as { errors?: readonly GraphQLError[] } | undefined)
					?.errors,
				response: body,
				variables,
				responseHeaders: response.headers,
				hasSetCookie: response.headers.has("set-cookie"),
				graphqlClientName:
					request.headers.get("x-graphql-client-name") ?? undefined,
				graphqlClientVersion:
					request.headers.get("x-graphql-client-version") ?? undefined,
				statusCode: response.status,
			});
		}

		return response;
	}) as THandler;
}
