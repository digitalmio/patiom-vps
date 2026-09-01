import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type { PostgresJsDatabase };

export type Db = PostgresJsDatabase<typeof schema>;

export type PostgresClientOptions = {
	/** Max pool size. Keep small (e.g. 5) when going through Hyperdrive. */
	max?: number;
	/** Hyperdrive requires prepare: false for postgres.js. */
	prepare?: boolean;
};

export function createDb(
	connectionString: string,
	logger = false,
	options: PostgresClientOptions = {},
) {
	return drizzle(postgres(connectionString, options), {
		schema,
		casing: "snake_case",
		logger,
	});
}
