import { Queue } from "bullmq";
import IORedis from "ioredis";

export const redis = new IORedis(
	(process.env.REDIS_URL as string) ?? "redis://localhost:6379",
);

// Reuse the ioredis instance in 2 different producers
export const schemaQueue = new Queue("schemaQueue", { connection: redis });
export const logsQueue = new Queue("logsQueue", { connection: redis });
