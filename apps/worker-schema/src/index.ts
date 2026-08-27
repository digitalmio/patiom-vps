import { createDb, type Db } from "@patiom/db";
import type { SchemaMessage } from "@patiom/shared";
import { processSchemaIntrospection } from "./processor";

export type Env = {
	DATABASE_URL: string;
	SCHEMA_QUEUE: Queue<SchemaMessage>;
};

export default {
	async queue(batch: MessageBatch<SchemaMessage>, env: Env) {
		// workerd freezes idle sockets between invocations — a module-cached
		// postgres.js client dies after ~a minute idle ("Failed query" with an
		// empty cause). Use a fresh connection per batch, close it when done.
		const database = createDb(env.DATABASE_URL);
		try {
			await processBatch(batch, database);
		} finally {
			await database.$client.end().catch(() => {});
		}
	},
};

async function processBatch(batch: MessageBatch<SchemaMessage>, database: Db) {
	for (const message of batch.messages) {
		const { schema: introspection, projectId } = message.body;

		try {
			// Validate job data
			if (!introspection) {
				throw new Error("Schema data is missing");
			}

			if (!introspection.__schema) {
				throw new Error("Introspection schema is missing");
			}

			if (!introspection.__schema.types) {
				throw new Error("Introspection types array is missing");
			}

			const result = await processSchemaIntrospection(
				database,
				introspection,
				projectId,
			);

			if (result.isNewVersion) {
				console.log("New schema version created", {
					projectId,
					typeCount: result.typeCount,
					fieldCount: result.fieldCount,
				});
			} else {
				console.debug("Schema unchanged", { projectId });
			}
		} catch (error) {
			// Retry via the queue — Cloudflare redelivers the message and moves it
			// to the dead-letter queue once max_retries is exhausted. Schema
			// messages are hash-deduped, so a redelivery is cheap.
			console.error("Schema job failed", {
				messageId: message.id,
				projectId,
				error: error instanceof Error ? error.message : String(error),
			});
			await message.retry();
		}
	}
}
