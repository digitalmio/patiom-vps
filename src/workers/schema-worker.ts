import { Worker } from "bullmq";
import closeWithGrace from "close-with-grace";
import type { IntrospectionQuery } from "graphql";
import IORedis from "ioredis";
import { env } from "@/env";
import { processSchemaIntrospection } from "./schema-processor";

const redis = new IORedis(env.REDIS_URL);

type SchemaJobData = {
	introspection: IntrospectionQuery;
	projectId: string;
};

export const schemaWorker = new Worker<SchemaJobData>(
	"schemaQueue",
	async (job) => {
		const { introspection, projectId } = job.data;

		const result = await processSchemaIntrospection(introspection, projectId);

		// Only log when schema actually changes
		if (result.isNewVersion) {
			console.log(
				`[Schema] New version for project ${projectId}: ${result.typeCount} types, ${result.fieldCount} fields`,
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
