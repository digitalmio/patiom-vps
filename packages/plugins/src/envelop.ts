import type { Plugin } from "@envelop/core";
import { print } from "graphql";
import { type GetHttp, getHttpFromContext } from "./core/http";
import { createPatiomLogger } from "./core/logger";
import type { PatiomLoggerOptions } from "./core/types";

export type EnvelopLoggerOptions = PatiomLoggerOptions & {
	/**
	 * Extract HTTP request info from the GraphQL context. Defaults to reading
	 * `contextValue.request` (the Fetch `Request` that GraphQL Yoga and other
	 * envelop-based servers expose).
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
 * Envelop plugin. Works with GraphQL Yoga, GraphQL Helix and any other
 * envelop-based server.
 */
export function usePatiomLogger(options: EnvelopLoggerOptions): Plugin {
	const logger = createPatiomLogger(options);
	const getHttp = options.getHttp ?? getHttpFromContext;

	return {
		onSchemaChange({ schema }) {
			if (schema) logger.sendSchema(schema);
		},
		onExecute({ args, executeFn, setExecuteFn }) {
			const http = getHttp(args.contextValue);
			const start = Date.now();
			const operation = print(args.document);

			setExecuteFn(async (executeArgs) => {
				const result = await executeFn(executeArgs);

				if (http && !isAsyncIterable(result) && !Array.isArray(result)) {
					await logger.log({
						headers: http.headers,
						method: http.method,
						start,
						operation,
						operationName: executeArgs.operationName,
						errors: result.errors,
						response: result,
						variables: executeArgs.variableValues,
						responseHeaders: http.responseHeaders,
						hasSetCookie: http.hasSetCookie,
						graphqlClientName: http.graphqlClientName,
						graphqlClientVersion: http.graphqlClientVersion,
					});
				}

				return result;
			});
		},
	};
}
