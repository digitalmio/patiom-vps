import {
	createDb,
	type Db,
	getActiveSchemaVersion,
	resolveFieldIds,
	schema,
} from "@patiom/db";
import {
	extractFieldPaths,
	extractOperationType,
	type LogMessage,
	parseUserAgent,
} from "@patiom/shared";
import type { IntrospectionQuery } from "graphql";
import { pruneExpiredGeoCache, resolveIpGeo } from "./ip-geo";

export type Env = {
	DATABASE_URL: string;
	LOGS_QUEUE: Queue<LogMessage>;
	IPLOCATE_KEY?: string;
	IP_GEO_TTL_DAYS?: string;
};

// Reuse the DB connection within an isolate
let db: Db | null = null;
function getDb(url: string): Db {
	db ??= createDb(url);
	return db;
}

export default {
	async queue(batch: MessageBatch<LogMessage>, env: Env) {
		const database = getDb(env.DATABASE_URL);
		await pruneExpiredGeoCache(database);

		for (const message of batch.messages) {
			const data = message.body;

			try {
				// Step 1: Get active schema version for this project
				const activeSchema = await getActiveSchemaVersion(
					database,
					data.projectId,
				);

				// Step 2: Parse user-agent
				const userAgentInfo = parseUserAgent(data.userAgent);

				// Step 3: Parse IP geolocation (DB-cached IPLocate lookup)
				const geoInfo = await resolveIpGeo(database, env, data.ip);

				// Step 4: Parse GraphQL query to extract field paths (with schema introspection if available)
				const introspection = activeSchema?.introspectionData
					? (activeSchema.introspectionData as IntrospectionQuery)
					: null;

				// Extract operation type (query, mutation, subscription)
				const operationType = extractOperationType(
					data.operation,
					data.operationName,
				);

				const requestedFields = extractFieldPaths(
					data.operation,
					data.operationName,
					introspection,
				);

				// Step 5: Resolve field paths to field IDs
				const requestedFieldIds = activeSchema
					? await resolveFieldIds(database, activeSchema.id, requestedFields)
					: [];

				// Step 6: Insert log record
				const timestamp = new Date(data.timestamp);

				await database.insert(schema.requestLogs).values({
					timestamp,
					projectId: data.projectId,
					schemaVersionId: activeSchema?.id || null,

					// GraphQL Operation
					operationType,
					operationName: data.operationName || null,
					operation: data.operation,
					variableHash: data.variableHash || null,

					// Performance
					elapsedMs: data.elapsed,
					responseSizeBytes: data.responseSize,
					responseHash: data.responseHash,

					// Client Info
					graphqlClientName: data.graphqlClientName || null,
					graphqlClientVersion: data.graphqlClientVersion || null,

					// Network
					method: data.method,
					statusCode: data.statusCode,
					hasSetCookie: data.hasSetCookie,
					referer: data.referer || null,
					userAgent: data.userAgent || null,
					ip: data.ip || null,

					// Parsed User Agent
					browserName: userAgentInfo.browserName,
					browserVersion: userAgentInfo.browserVersion,
					osName: userAgentInfo.osName,
					osVersion: userAgentInfo.osVersion,
					platformType: userAgentInfo.platformType,

					// Parsed Geolocation
					countryCode: geoInfo.countryCode,
					countryName: geoInfo.countryName,
					city: geoInfo.city,

					// Cache
					varyHash: data.varyHash || null,
					errorCount: data.errors?.length || 0,
					errors: data.errors || null,

					// Resolved field IDs (references to schema_fields table)
					requestedFieldIds:
						requestedFieldIds.length > 0 ? requestedFieldIds : null,
				});
			} catch (error) {
				// Log and drop (matches previous BullMQ behavior of permanent failure
				// with a single attempt)
				console.error("Log job failed", {
					messageId: message.id,
					projectId: data.projectId,
					operationName: data.operationName,
					hasOperation: !!data.operation,
					operationLength: data.operation?.length,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	},
};
