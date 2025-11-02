import { Worker } from "bullmq";
import closeWithGrace from "close-with-grace";
import type { IntrospectionQuery } from "graphql";
import IORedis from "ioredis";
import pino from "pino";
import { env } from "@/env";
import { db, schema } from "@/lib/db";
import { resolveFieldIds } from "@/lib/db/queries/fields";
import { getActiveSchemaVersion } from "@/lib/db/queries/schema";
import { parseIpGeolocation } from "@/lib/geo";
import { extractFieldPaths, extractOperationType } from "@/lib/graphql-parser";
import { parseUserAgent } from "@/lib/user-agent";
import type { LogJobData } from "./worker.types";

const logger = pino({
	name: "logs-worker",
	level: "debug",
});

const redis = new IORedis(env.REDIS_URL, {
	maxRetriesPerRequest: null,
});

export const logsWorker = new Worker<LogJobData>(
	"logsQueue",
	async (job) => {
		logger.info(
			{ jobId: job.id, projectId: job.data.projectId },
			"Processing job",
		);

		const data = job.data;

		// Step 1: Get active schema version for this project
		logger.debug({ jobId: job.id }, "Fetching active schema version");
		const activeSchema = await getActiveSchemaVersion(data.projectId);
		logger.debug(
			{ jobId: job.id, schemaVersionId: activeSchema?.id || "none" },
			"Active schema version",
		);

		// Step 2: Parse user-agent
		const userAgentInfo = parseUserAgent(data.userAgent);

		// Step 3: Parse IP geolocation
		const geoInfo = await parseIpGeolocation(data.ip);

		// Step 4: Parse GraphQL query to extract field paths (with schema introspection if available)
		const introspection = activeSchema?.introspectionData
			? (activeSchema.introspectionData as IntrospectionQuery)
			: null;

		// Extract operation type (query, mutation, subscription)
		const operationType = extractOperationType(
			data.operation,
			data.operationName,
		);

		logger.debug({ jobId: job.id }, "Extracting field paths from operation");
		const requestedFields = extractFieldPaths(
			data.operation,
			data.operationName,
			introspection,
		);
		logger.debug(
			{ jobId: job.id, fieldPathCount: requestedFields.length },
			"Found field paths",
		);

		// Step 5: Resolve field paths to field IDs
		const requestedFieldIds = activeSchema
			? await resolveFieldIds(activeSchema.id, requestedFields)
			: [];
		logger.debug(
			{ jobId: job.id, fieldIdCount: requestedFieldIds.length },
			"Resolved field IDs",
		);

		// Step 6: Insert log record
		const timestamp = new Date(data.timestamp);
		const datePartition = timestamp.toISOString().split("T")[0]; // Extract date only (YYYY-MM-DD)

		logger.debug({ jobId: job.id }, "Inserting log record");
		try {
			await db.insert(schema.requestLogs).values({
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
				varyHash: data.varyHash || null, // Errors
				errorCount: data.errors?.length || 0,
				errors: data.errors || null,

				// Resolved field IDs (references to schema_fields table)
				requestedFieldIds:
					requestedFieldIds.length > 0 ? requestedFieldIds : null,

				// Date partition for TimescaleDB (date only, no time)
				datePartition,
			});

			logger.debug({ jobId: job.id }, "Successfully inserted log record");
		} catch (error) {
			logger.error({ jobId: job.id, error }, "Error inserting log record");
			throw error;
		}
	},
	{
		connection: redis,
		removeOnComplete: { count: 1000 }, // Keep last 1000 successful jobs
		removeOnFail: { count: 100 }, // Keep last 100 failed jobs
	},
);

// Only log failures
logsWorker.on("failed", (job, err) => {
	logger.error(
		{
			jobId: job?.id,
			error: err.message,
			stack: err.stack,
			data: job?.data
				? {
						projectId: job.data.projectId,
						operationName: job.data.operationName,
						hasOperation: !!job.data.operation,
						operationLength: job.data.operation?.length,
					}
				: undefined,
		},
		"Job failed",
	);
});

// Graceful shutdown
closeWithGrace({ delay: 5000 }, async ({ signal, err }) => {
	if (err) {
		logger.error({ error: err }, "Shutdown due to error");
	}
	logger.info({ signal }, "Shutting down gracefully");

	await logsWorker.close();
	await redis.quit();
});

logger.info("Started and waiting for jobs");
