import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { schemaVersions } from "../schema";

export async function findExistingSchema(
	db: Db,
	projectId: string,
	schemaHash: number,
) {
	const existing = await db.query.schemaVersions.findFirst({
		where: and(
			eq(schemaVersions.projectId, projectId),
			eq(schemaVersions.schemaHash, schemaHash),
		),
	});

	return existing ?? null;
}

export async function getActiveSchemaVersion(db: Db, projectId: string) {
	const active = await db.query.schemaVersions.findFirst({
		where: and(
			eq(schemaVersions.projectId, projectId),
			eq(schemaVersions.isActive, true),
		),
		orderBy: desc(schemaVersions.createdAt),
	});

	return active ?? null;
}
