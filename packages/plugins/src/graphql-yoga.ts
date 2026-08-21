import { type ExecutionResult, print } from "graphql";
import type { Plugin } from "graphql-yoga";
import { getHttpFromContext, type HttpInfo } from "./core/http";
import { createPatiomLogger } from "./core/logger";
import type { PatiomLoggerOptions } from "./core/types";

type Pending = {
	start: number;
	operation: string;
	operationName?: string | null;
	variables?: Record<string, unknown> | null;
	result: ExecutionResult;
	http: HttpInfo;
};

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	return (
		value != null &&
		typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
			"function"
	);
}

/**
 * GraphQL Yoga plugin. Captures the request in the execution phase and adds
 * response-level detail (status, set-cookie, response headers) when the
 * response is finalized.
 */
export function createPatiomYogaPlugin(options: PatiomLoggerOptions): Plugin {
	const logger = createPatiomLogger(options);
	const starts = new WeakMap<Request, number>();
	const pending = new WeakMap<Request, Pending>();

	return {
		onSchemaChange({ schema }) {
			if (schema) logger.sendSchema(schema);
		},
		async onRequest({ request }) {
			starts.set(request, Date.now());
		},
		onExecute({ args, executeFn, setExecuteFn }) {
			const http = getHttpFromContext(args.contextValue);
			const operation = print(args.document);

			setExecuteFn(async (executeArgs) => {
				const result = await executeFn(executeArgs);

				const request = (executeArgs.contextValue as { request?: Request })
					?.request;

				if (
					http &&
					request &&
					!isAsyncIterable(result) &&
					!Array.isArray(result)
				) {
					pending.set(request, {
						start: starts.get(request) ?? Date.now(),
						operation,
						operationName: executeArgs.operationName,
						variables: executeArgs.variableValues,
						result,
						http,
					});
				}

				return result;
			});
		},
		async onResponse({ request, response }) {
			const data = pending.get(request);
			if (!data) return;
			pending.delete(request);

			logger.log({
				headers: data.http.headers,
				method: data.http.method,
				start: data.start,
				operation: data.operation,
				operationName: data.operationName,
				errors: data.result.errors,
				response: data.result,
				variables: data.variables,
				responseHeaders: response.headers,
				hasSetCookie: response.headers.has("set-cookie"),
				graphqlClientName: data.http.graphqlClientName,
				graphqlClientVersion: data.http.graphqlClientVersion,
				statusCode: response.status,
			});
		},
	};
}
