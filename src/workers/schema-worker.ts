import { Worker } from "bullmq";
import closeWithGrace from "close-with-grace";
import type { IntrospectionQuery } from "graphql";
import IORedis from "ioredis";
import { env } from "@/env";
import { processSchemaIntrospection } from "./schema-processor";

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
		console.log(
			`[Schema Worker] Processing job ${job.id} for project ${job.data.projectId}`,
		);

		const { schema: introspection, projectId } = job.data;

		// Validate job data
		if (!introspection) {
			console.error(`[Schema Worker] Job ${job.id}: schema is undefined`);
			throw new Error("Schema data is missing");
		}

		if (!introspection.__schema) {
			console.error(
				`[Schema Worker] Job ${job.id}: schema.__schema is undefined`,
			);
			throw new Error("Introspection schema is missing");
		}

		if (!introspection.__schema.types) {
			console.error(
				`[Schema Worker] Job ${job.id}: schema.__schema.types is undefined`,
			);
			throw new Error("Introspection types array is missing");
		}

		console.log(
			`[Schema Worker] Job ${job.id}: Received ${introspection.__schema.types.length} types`,
		);

		const result = await processSchemaIntrospection(introspection, projectId);

		// Only log when schema actually changes
		if (result.isNewVersion) {
			console.log(
				`[Schema] New version for project ${projectId}: ${result.typeCount} types, ${result.fieldCount} fields`,
			);
		} else {
			console.log(
				`[Schema] Job ${job.id}: Schema unchanged for project ${projectId}`,
			);
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
	console.error(`[Schema Worker] Job ${job?.id} failed:`, err.message);
	console.error(`[Schema Worker] Job ${job?.id} stack trace:`, err.stack);
	if (job?.data) {
		console.error(`[Schema Worker] Job ${job.id} data:`, {
			projectId: job.data.projectId,
			hasSchema: !!job.data.schema,
			hasSchemaData: !!job.data.schema?.__schema,
			hasTypes: !!job.data.schema?.__schema?.types,
			typesLength: job.data.schema?.__schema?.types?.length,
		});
	}
});

// Graceful shutdown with close-with-grace
closeWithGrace({ delay: 5000 }, async ({ signal, err }) => {
	if (err) {
		console.error("[Schema Worker] Shutdown due to error:", err);
	}
	console.log(
		`[Schema Worker] Received ${signal}, shutting down gracefully...`,
	);

	await schemaWorker.close();
	await redis.quit();
});

console.log("[Schema Worker] Started and waiting for jobs...");
