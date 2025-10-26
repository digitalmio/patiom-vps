import { Worker } from "bullmq";
import closeWithGrace from "close-with-grace";
import type { IntrospectionQuery } from "graphql";
import IORedis from "ioredis";
import pino from "pino";
import { env } from "@/env";
import { processSchemaIntrospection } from "./schema-processor";

const logger = pino({
	name: "schema-worker",
	level: "debug",
});

const redis = new IORedis(env.REDIS_URL, {
	maxRetriesPerRequest: null,
});

type SchemaJobData = {
	schema: IntrospectionQuery;
	projectId: string;
	timestamp: Date;
};

export const schemaWorker = new Worker<SchemaJobData>(
	"schemaQueue",
	async (job) => {
		logger.info(
			{ jobId: job.id, projectId: job.data.projectId },
			"Processing job",
		);

		const { schema: introspection, projectId } = job.data;

		// Validate job data
		if (!introspection) {
			logger.error({ jobId: job.id }, "schema is undefined");
			throw new Error("Schema data is missing");
		}

		if (!introspection.__schema) {
			logger.error({ jobId: job.id }, "schema.__schema is undefined");
			throw new Error("Introspection schema is missing");
		}

		if (!introspection.__schema.types) {
			logger.error({ jobId: job.id }, "schema.__schema.types is undefined");
			throw new Error("Introspection types array is missing");
		}

		logger.debug(
			{ jobId: job.id, typesCount: introspection.__schema.types.length },
			"Received types",
		);

		const result = await processSchemaIntrospection(introspection, projectId);

		// Only log when schema actually changes
		if (result.isNewVersion) {
			logger.info(
				{
					projectId,
					typeCount: result.typeCount,
					fieldCount: result.fieldCount,
				},
				"New schema version created",
			);
		} else {
			logger.debug({ jobId: job.id, projectId }, "Schema unchanged");
		}

		return result;
	},
	{
		connection: redis,
		removeOnComplete: { count: 100 }, // Keep last 100 successful jobs
		removeOnFail: { count: 50 }, // Keep last 50 failed jobs for debugging
	},
);

// Only log failures
schemaWorker.on("failed", (job, err) => {
	logger.error(
		{
			jobId: job?.id,
			error: err.message,
			stack: err.stack,
			data: job?.data
				? {
						projectId: job.data.projectId,
						hasSchema: !!job.data.schema,
						hasSchemaData: !!job.data.schema?.__schema,
						hasTypes: !!job.data.schema?.__schema?.types,
						typesLength: job.data.schema?.__schema?.types?.length,
					}
				: undefined,
		},
		"Job failed",
	);
});

// Graceful shutdown with close-with-grace
closeWithGrace({ delay: 5000 }, async ({ signal, err }) => {
	if (err) {
		logger.error({ error: err }, "Shutdown due to error");
	}
	logger.info({ signal }, "Shutting down gracefully");

	await schemaWorker.close();
	await redis.quit();
});

logger.info("Started and waiting for jobs");
