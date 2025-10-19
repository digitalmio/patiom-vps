import { and, db, eq, schema } from "..";

export async function findExistingSchema(
	projectId: string,
	schemaHash: number,
) {
	const existing = await db.query.schemaVersions.findFirst({
		where: and(
			eq(schema.schemaVersions.projectId, projectId),
			eq(schema.schemaVersions.schemaHash, schemaHash),
		),
	});

	return existing ?? null;
}
