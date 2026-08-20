// Query helpers for schema fields
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../client";
import { schemaFields } from "../schema";

/**
 * Resolve field paths to field IDs for a given schema version
 * @param db - The database instance
 * @param schemaVersionId - The schema version ID
 * @param fieldPaths - Array of field paths like ["Query.user", "User.id", "Post.title"]
 * @returns Array of field IDs that exist in the schema
 */
export async function resolveFieldIds(
	db: Db,
	schemaVersionId: string,
	fieldPaths: string[],
): Promise<string[]> {
	if (fieldPaths.length === 0) return [];

	const fields = await db
		.select({ id: schemaFields.id })
		.from(schemaFields)
		.where(
			and(
				eq(schemaFields.schemaVersionId, schemaVersionId),
				inArray(schemaFields.fieldPath, fieldPaths),
			),
		);

	return fields.map((f) => f.id);
}
