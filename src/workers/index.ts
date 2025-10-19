import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/env";

const redis = new IORedis(env.REDIS_URL);

const schemaWorker = new Worker(
	"schemaQueue",
	async (job) => {
		// do some work
	},
	{
		connection: redis,
		removeOnFail: { count: 0 },
	},
);

process.on("SIGINT", async () => {
	await schemaWorker.close();
	process.exit(0);
});
