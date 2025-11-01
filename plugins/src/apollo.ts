import { type GraphQLSchema, introspectionFromSchema } from "graphql";
import type {
	LogRequestOptions,
	PatiomLoggerOptions,
	PatiomPayload,
	PatiomPayloadOptions,
} from "./apollo.types";
import { createDjb2Hash } from "./shared/hash";

function extractPatiomPayload({
	headers,
	operation,
	method,
	start,
	operationName,
	errors,
	response,
	variables,
	responseHeaders,
	sendVariablesAsHash,
	hasSetCookie,
	graphqlClientName,
	graphqlClientVersion,
}: PatiomPayloadOptions): PatiomPayload {
	const forwardedFor = headers.get("x-forwarded-for");
	const ips = forwardedFor
		? forwardedFor.split(",").map((ip) => ip.trim())
		: [];

	const vary = responseHeaders?.get("vary");
	let varyHash: number | undefined;

	if (vary?.length) {
		const varyHeaders = vary
			.split(",")
			.map((headerName) => headerName.trim())
			.filter(Boolean)
			.sort();

		const variedValues = varyHeaders
			.map((headerName) => {
				const headerValue = headers.get(headerName);
				return headerValue ? `${headerName}:${headerValue}` : null;
			})
			.filter(Boolean)
			.join("\n");

		if (variedValues) {
			varyHash = createDjb2Hash(variedValues);
		}
	}

	// Determine client IP from various headers
	const clientIp =
		ips[0] ||
		headers.get("true-client-ip") ||
		headers.get("x-real-ip") ||
		undefined;

	return {
		graphqlClientName,
		graphqlClientVersion,
		operation,
		operationName,
		variables: sendVariablesAsHash ? undefined : variables,
		variableHash: sendVariablesAsHash
			? createDjb2Hash(JSON.stringify(variables ?? {}))
			: undefined,
		method,
		elapsed: Date.now() - start,
		ip: clientIp,
		hasSetCookie,
		referer: headers.get("referer") ?? undefined,
		userAgent: headers.get("user-agent") ?? undefined,
		statusCode: 200,
		errors,
		responseSize: JSON.stringify(response).length,
		responseHash: createDjb2Hash(JSON.stringify(response)),
		varyHash,
	};
}
function warnFetch(fetchFn: unknown): void {
	if (typeof fetchFn !== "function") {
		console.warn(
			"Patiom logger plugin requires a fetch function to be provided as an option.",
		);
	}
}

const getHostname = (): string => {
	const endpoint = process.env.PATIOM_ENDPOINT;
	return endpoint === "local" || endpoint === "staging"
		? "http://127.0.0.1:4000"
		: "https://patiom.dev";
};

const hostname = getHostname();

async function logRequest({
	fetch: fetchFn,
	payload,
	token,
}: LogRequestOptions): Promise<Response> {
	return fetchFn(`${hostname}/api/ingest/log`, {
		method: "POST",
		body: JSON.stringify(payload),
		headers: {
			"Content-Type": "application/json",
			"Patiom-Token": token,
		},
	});
}

// Apollo Server plugin implementation
const createPatiomLoggerPlugin = (options: PatiomLoggerOptions) => {
	const sendVariablesAsHash = options.sendVariablesAsHash ?? true;
	const shouldSyncSchema = options.schemaSyncing ?? true;
	let stopped = false;
	let timeout: NodeJS.Timeout | null = null;

	const sendSchema = async (apiSchema: GraphQLSchema): Promise<void> => {
		if (!shouldSyncSchema) return;

		const introspection = introspectionFromSchema(apiSchema);
		const randomTimeout = Math.random() * 5000;

		if (timeout) {
			clearTimeout(timeout);
		}

		timeout = setTimeout(async () => {
			timeout = null;

			if (stopped) return;

			try {
				options.fetch(`${hostname}/api/ingest/schema`, {
					method: "POST",
					body: JSON.stringify({ schema: introspection }),
					headers: {
						"Content-Type": "application/json",
						"Patiom-Token": options.token,
					},
				});
			} catch (_error) {
				// Silently fail - schema sync shouldn't break the application
			}
		}, randomTimeout);
	};
	return {
		async serverWillStart() {
			return {
				schemaDidLoadOrUpdate({ apiSchema }: { apiSchema: GraphQLSchema }) {
					sendSchema(apiSchema);
				},
				async serverWillStop() {
					stopped = true;
					if (timeout) {
						clearTimeout(timeout);
					}
				},
			};
		},
		async requestDidStart(requestCtx: any) {
			const start = Date.now();
			const { request } = requestCtx;
			const { operationName, variables, http, query } = request;

			if (!http) return undefined;

			const { headers, method } = http;

			// Skip requests from CDN
			if (headers.has("gcdn-request-id")) return undefined;

			return {
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

					const patiomPayload = extractPatiomPayload({
						headers,
						responseHeaders: response.http.headers,
						operation: queryString,
						method,
						sendVariablesAsHash,
						start,
						operationName,
						errors: respContext.errors,
						response: respBody,
						variables,
						hasSetCookie: response.http.headers.has("set-cookie"),
						graphqlClientName,
						graphqlClientVersion,
					});

					warnFetch(options.fetch);

					try {
						await logRequest({
							fetch: options.fetch,
							payload: patiomPayload,
							token: options.token,
						});
					} catch (_error) {
						// Silently fail - logging shouldn't break the application
					}
				},
			};
		},
	};
};

export { createDjb2Hash, createPatiomLoggerPlugin };
