import {
	createDb,
	type Db,
	ensureFields,
	findExistingSchema,
	getActiveSchemaVersion,
	schema,
} from "@patiom/db";
import {
	canonicalFieldId,
	extractFieldPaths,
	extractOperationType,
	type LogMessage,
	parseUserAgent,
} from "@patiom/shared";
import type { IntrospectionQuery } from "graphql";
import { hashIp } from "./hash";
import { resolveIpGeo } from "./ip-geo";

type SchemaVersion = typeof schema.schemaVersions.$inferSelect;

export type Env = {
	HYPERDRIVE: Hyperdrive;
	LOGS_QUEUE: Queue<LogMessage>;
	IPLOCATE_KEY?: string;
	IP_GEO_TTL_DAYS?: string;
};

// Graduated retry schedule while waiting for the log's schema version to
// land: attempts 1-3 @1s, 4-6 @2s, 7+ @5s (~33s total).
const SCHEMA_WAIT_MAX_ATTEMPTS = 10;

function schemaWaitDelaySeconds(attempts: number): number {
	if (attempts <= 3) return 1;
	if (attempts <= 6) return 2;
	return 5;
}

function splitFieldPath(fieldPath: string): {
	parentType: string;
	fieldName: string;
} {
	const dot = fieldPath.indexOf(".");
	return {
		parentType: fieldPath.slice(0, dot),
		fieldName: fieldPath.slice(dot + 1),
	};
}

export default {
	async queue(
		batch: MessageBatch<LogMessage>,
		env: Env,
		ctx: { waitUntil: (promise: Promise<unknown>) => void },
	) {
		// workerd freezes idle sockets between invocations — a module-cached
		// postgres.js client dies after ~a minute idle ("Failed query" with an
		// empty cause). Use a fresh connection per batch, close it when done.
		const database = createDb(env.HYPERDRIVE.connectionString, false, {
			prepare: false,
			max: 5,
		});
		try {
			// bind: workerd's waitUntil throws "Illegal invocation" when the
			// detached method reference loses its `this`.
			await processBatch(batch, env, database, ctx.waitUntil.bind(ctx));
		} finally {
			await database.$client.end().catch(() => {});
		}
	},
};

async function processBatch(
	batch: MessageBatch<LogMessage>,
	env: Env,
	database: Db,
	waitUntil: (promise: Promise<unknown>) => void,
) {
	for (const message of batch.messages) {
		const data = message.body;

		try {
			// Step 1: Attribute the log to the exact schema version that served
			// the request (by the hash the client sent). If that version hasn't
			// landed yet (schema message still in flight), wait for it. Legacy
			// clients without a hash fall back to the project's current version.
			let activeSchema: SchemaVersion | null = null;
			if (data.schemaHash != null) {
				activeSchema = await findExistingSchema(
					database,
					data.projectId,
					data.schemaHash,
				);
				if (!activeSchema && message.attempts < SCHEMA_WAIT_MAX_ATTEMPTS) {
					console.warn("Schema version not found yet, retrying", {
						messageId: message.id,
						projectId: data.projectId,
						schemaHash: data.schemaHash,
						attempts: message.attempts,
					});
					await message.retry({
						delaySeconds: schemaWaitDelaySeconds(message.attempts),
					});
					continue;
				}
			} else {
				activeSchema = await getActiveSchemaVersion(database, data.projectId);
			}

			// Step 2: Parse user-agent
			const userAgentInfo = parseUserAgent(data.userAgent);

			// Step 3: Parse IP geolocation (edge-cached IPLocate lookup). The raw
			// IP is used for resolution only — the SHA-256 hash is stored so no
			// PII address is persisted.
			const geoInfo = await resolveIpGeo(env, data.ip, waitUntil);
			const ipHash = data.ip ? await hashIp(data.ip) : null;

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

			// Step 5: Field references use deterministic canonical IDs
			// (`${projectId}:${fieldPath}`) — no lookup needed. When the paths
			// were resolved against a schema (accurate), also make sure the
			// canonical `fields` rows exist: they may be missing if the schema
			// version was only partially created. Without a schema the parser
			// degrades and produces unreliable paths — those must NOT become
			// canonical rows.
			const requestedFieldIds = requestedFields.map((fieldPath) =>
				canonicalFieldId(data.projectId, fieldPath),
			);
			if (introspection && requestedFields.length > 0) {
				await ensureFields(
					database,
					data.projectId,
					requestedFields.map((fieldPath) => ({
						fieldPath,
						...splitFieldPath(fieldPath),
					})),
				);
			}

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
				ip: ipHash,

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

				// Resolved field IDs (references to fields table)
				requestedFieldIds:
					requestedFieldIds.length > 0 ? requestedFieldIds : null,
			});
		} catch (error) {
			// Retry via the queue — Cloudflare redelivers the message and moves
			// it to the dead-letter queue once max_retries is exhausted.
			console.error("Log job failed", {
				messageId: message.id,
				projectId: data.projectId,
				operationName: data.operationName,
				hasOperation: !!data.operation,
				operationLength: data.operation?.length,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			await message.retry({ delaySeconds: 5 });
		}
	}
}
