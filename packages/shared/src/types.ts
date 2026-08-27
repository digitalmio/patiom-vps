import type { IntrospectionQuery } from "graphql";

/**
 * Shared message shapes exchanged through Cloudflare Queues.
 *
 * Cloudflare Queues serializes messages to JSON, so dates travel as ISO
 * strings and consumers must convert them back (e.g. `new Date(ts)`).
 */

export type SchemaMessage = {
	projectId: string;
	timestamp: string;
	schema: IntrospectionQuery;
};

export type LogMessage = {
	projectId: string;
	timestamp: string;

	// Schema attribution — djb2 hash of the introspection the serving server
	// is running. Lets the consumer stamp the exact schema version (rolling-
	// deploy safe) and wait for that version to land before processing.
	schemaHash?: number;

	// GraphQL Operation
	operation: string;
	operationName?: string | null;
	variableHash?: number;

	// Performance
	elapsed: number;
	responseSize: number;
	responseHash: number;

	// Client Info
	graphqlClientName?: string;
	graphqlClientVersion?: string;

	// Network
	method: string;
	statusCode: number;
	hasSetCookie: boolean;
	referer?: string;
	userAgent?: string;
	ip?: string;

	// Cache
	varyHash?: number;

	// Errors
	errors?: Array<{
		message: string;
		locations?: Array<{ line: number; column: number }>;
		path?: Array<string | number>;
	}>;
};
