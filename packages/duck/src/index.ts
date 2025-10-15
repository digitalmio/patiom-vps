import { DuckDBInstance } from "@duckdb/node-api";

const path = process.env.DATABASE_PATH ?? "../../database/duck.db";

export const db = (readOnly = true) =>
	DuckDBInstance.create(path, {
		access_mode: readOnly ? "READ_ONLY" : "READ_WRITE",
	});
