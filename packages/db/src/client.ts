import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type { PostgresJsDatabase };

export type Db = PostgresJsDatabase<typeof schema>;

export function createDb(connectionString: string, logger = false) {
	return drizzle(postgres(connectionString), {
		schema,
		casing: "snake_case",
		logger,
	});
}
