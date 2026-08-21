import type { GraphQLSchema } from "graphql";
import { createDjb2Hash } from "./core/hash";
import { createPatiomLogger } from "./core/logger";
import type { PatiomLoggerOptions } from "./core/types";

// Apollo Server plugin implementation
const createPatiomLoggerPlugin = (options: PatiomLoggerOptions) => {
	const logger = createPatiomLogger(options);

	return {
		async serverWillStart() {
			return {
				schemaDidLoadOrUpdate({ apiSchema }: { apiSchema: GraphQLSchema }) {
					logger.sendSchema(apiSchema);
				},
				async serverWillStop() {
					logger.stop();
				},
			};
		},
		// biome-ignore lint/suspicious/noExplicitAny: this is sent by Apollo Server
		async requestDidStart(requestCtx: any) {
			const start = Date.now();
			const { request } = requestCtx;
			const { operationName, variables, http, query } = request;

			if (!http) return undefined;

			const { headers, method } = http;

			// Skip requests from CDN
			if (headers.has("gcdn-request-id")) return undefined;

			return {
				// biome-ignore lint/suspicious/noExplicitAny: this is sent by Apollo Server
				async willSendResponse(respContext: any) {
					const { response, source } = respContext;

					// Only support single (non-incremental) responses
					if (response.body.kind !== "single") {
						console.warn(
							"Patiom does not currently support logging incremental results.",
						);
						return;
					}

					const respBody = response.body.singleResult;
					const queryString = query || source;

					if (!queryString) return;

					const graphqlClientName =
						request.http?.headers.get("x-graphql-client-name") ?? undefined;
					const graphqlClientVersion =
						request.http?.headers.get("x-graphql-client-version") ?? undefined;

					logger.log({
						headers,
						responseHeaders: response.http.headers,
						operation: queryString,
						method,
						start,
						operationName,
						errors: respContext.errors,
						response: respBody,
						variables,
						hasSetCookie: response.http.headers.has("set-cookie"),
						graphqlClientName,
						graphqlClientVersion,
						statusCode: response.http.status ?? 200,
					});
				},
			};
		},
	};
};

export { createDjb2Hash, createPatiomLoggerPlugin };
