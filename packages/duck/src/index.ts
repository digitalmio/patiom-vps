import { DuckDBInstance } from "@duckdb/node-api";
import { DuckDbDialect } from "@oorabona/kysely-duckdb";
import { Kysely } from "kysely";

const path = process.env.DATABASE_PATH ?? "../../database/duck.db";

export const db = (readOnly = true) =>
	DuckDBInstance.create(path, {
		access_mode: readOnly ? "READ_ONLY" : "READ_WRITE",
	});

export const kysely = new Kysely({
	dialect: new DuckDbDialect({
		database: await db(),
		uuidAsString: true, // UUIDs are native DuckDB values by default. true to get strings.
	}),
});
