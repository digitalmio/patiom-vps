import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/env";

const redis = new IORedis(env.REDIS_URL, {
	maxRetriesPerRequest: null,
});

// Reuse the ioredis instance in 2 different producers
export const schemaQueue = new Queue("schemaQueue", {
	connection: redis,
	defaultJobOptions: {
		removeOnComplete: true,
		removeOnFail: 1000,
	},
});
export const logsQueue = new Queue("logsQueue", {
	connection: redis,
	defaultJobOptions: {
		removeOnComplete: true,
		removeOnFail: 1000,
	},
});
