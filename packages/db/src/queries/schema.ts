import { and, desc, eq, isNull, sql } from "drizzle-orm";
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
			isNull(schemaVersions.deletedAt),
		),
	});

	return existing ?? null;
}

/**
 * The project's current schema version — the one with the highest
 * `activated_at`. Re-deploying a previous schema bumps `activated_at`,
 * so no flag maintenance is needed.
 */
export async function getActiveSchemaVersion(db: Db, projectId: string) {
	const active = await db.query.schemaVersions.findFirst({
		where: and(
			eq(schemaVersions.projectId, projectId),
			isNull(schemaVersions.deletedAt),
		),
		orderBy: desc(schemaVersions.activatedAt),
	});

	return active ?? null;
}

/**
 * Mark a schema version as the project's current one by bumping
 * `activated_at`. Called on every hash-match — re-affirming the already-newest
 * version is a harmless write; bumping a superseded one (A→B→A reversion)
 * restores it as current.
 */
export async function activateSchemaVersion(db: Db, schemaVersionId: string) {
	await db
		.update(schemaVersions)
		.set({ activatedAt: sql`now()` })
		.where(eq(schemaVersions.id, schemaVersionId));
}
