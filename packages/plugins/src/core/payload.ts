import { anonymizeQuery } from "./anonymize";
import { createDjb2Hash } from "./hash";
import type { PatiomPayload, PatiomPayloadOptions } from "./types";

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
	schemaHash,
	hasSetCookie,
	graphqlClientName,
	graphqlClientVersion,
	statusCode,
	anonymize,
}: PatiomPayloadOptions & { sendVariablesAsHash: boolean }): PatiomPayload {
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
		operation: anonymize ? anonymizeQuery(operation) : operation,
		operationName,
		variables: sendVariablesAsHash ? undefined : variables,
		variableHash: sendVariablesAsHash
			? createDjb2Hash(JSON.stringify(variables ?? {}))
			: undefined,
		schemaHash,
		method,
		elapsed: Date.now() - start,
		ip: clientIp,
		hasSetCookie: hasSetCookie ?? false,
		referer: headers.get("referer") ?? undefined,
		userAgent: headers.get("user-agent") ?? undefined,
		statusCode: statusCode ?? 200,
		errors,
		responseSize: JSON.stringify(response).length,
		responseHash: createDjb2Hash(JSON.stringify(response)),
		varyHash,
	};
}

export { extractPatiomPayload };
