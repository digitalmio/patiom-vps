import { createDb, type Db } from "@patiom/db";
import type { SchemaMessage } from "@patiom/shared";
import { processSchemaIntrospection } from "./processor";

export type Env = {
	DATABASE_URL: string;
	SCHEMA_QUEUE: Queue<SchemaMessage>;
};

// Reuse the DB connection within an isolate
let db: Db | null = null;
function getDb(url: string): Db {
	db ??= createDb(url);
	return db;
}

export default {
	async queue(batch: MessageBatch<SchemaMessage>, env: Env) {
		const database = getDb(env.DATABASE_URL);

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
				// Log and drop (matches previous BullMQ behavior of permanent failure
				// with a single attempt)
				console.error("Schema job failed", {
					messageId: message.id,
					projectId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	},
};
