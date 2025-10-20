import { Worker } from "bullmq";
import closeWithGrace from "close-with-grace";
import type { IntrospectionQuery } from "graphql";
import IORedis from "ioredis";
import { nanoid } from "nanoid";
import { env } from "@/env";
import { db } from "@/lib/db";
import { resolveFieldIds } from "@/lib/db/queries/fields";
import { getActiveSchemaVersion } from "@/lib/db/queries/schema";
import { requestLogs } from "@/lib/db/schema";
import { parseIpGeolocation } from "@/lib/geo";
import { extractFieldPaths } from "@/lib/graphql-parser";
import { parseUserAgent } from "@/lib/user-agent";
import type { LogJobData } from "./logs-worker.types";

const redis = new IORedis(env.REDIS_URL);

export const logsWorker = new Worker<LogJobData>(
	"logsQueue",
	async (job) => {
		const data = job.data;

		// Step 1: Get active schema version for this project
		const activeSchema = await getActiveSchemaVersion(data.projectId);

		// Step 2: Parse user-agent
		const userAgentInfo = parseUserAgent(data.userAgent);

		// Step 3: Parse IP geolocation
		const geoInfo = await parseIpGeolocation(data.ip);

		// Step 4: Parse GraphQL query to extract field paths (with schema introspection if available)
		const introspection = activeSchema?.introspectionData
			? (activeSchema.introspectionData as IntrospectionQuery)
			: null;

		const requestedFields = extractFieldPaths(
			data.operation,
			data.operationName,
			introspection,
		);

		// Step 5: Resolve field paths to field IDs
		const requestedFieldIds = activeSchema
			? await resolveFieldIds(activeSchema.id, requestedFields)
			: [];

		// Step 6: Insert log record
		const timestamp = new Date(data.timestamp);
		const datePartition = timestamp.toISOString().split("T")[0]; // Extract date only (YYYY-MM-DD)

		await db.insert(requestLogs).values({
			id: nanoid(),
			timestamp,
			projectId: data.projectId,
			schemaVersionId: activeSchema?.id || null,

			// GraphQL Operation
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
			latitude: geoInfo.latitude,
			longitude: geoInfo.longitude,

			// Cache
			varyHash: data.varyHash || null, // Errors
			errorCount: data.errors?.length || 0,
			errors: data.errors || null,

			// Resolved field IDs (references to schema_fields table)
			requestedFieldIds:
				requestedFieldIds.length > 0 ? requestedFieldIds : null,

			// Date partition for TimescaleDB (date only, no time)
			datePartition,
		});

		return { logId: nanoid(), fieldsCount: requestedFieldIds.length };
	},
	{
		connection: redis,
		removeOnComplete: { count: 1000 }, // Keep last 1000 successful jobs
		removeOnFail: { count: 100 }, // Keep last 100 failed jobs
	},
);

// Only log failures
logsWorker.on("failed", (job, err) => {
	console.error(`[Logs Worker] Job ${job?.id} failed:`, err.message);
});

// Graceful shutdown
closeWithGrace({ delay: 5000 }, async ({ signal, err }) => {
	if (err) {
		console.error("[Logs Worker] Shutdown due to error:", err);
	}
	console.log(`[Logs Worker] Received ${signal}, shutting down gracefully...`);

	await logsWorker.close();
	await redis.quit();
});

console.log("[Logs Worker] Started and waiting for jobs...");
