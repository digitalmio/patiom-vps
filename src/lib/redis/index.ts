import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/env";

export const redis = new IORedis(env.REDIS_URL);

// Reuse the ioredis instance in 2 different producers
export const schemaQueue = new Queue("schemaQueue", { connection: redis });
export const logsQueue = new Queue("logsQueue", { connection: redis });
