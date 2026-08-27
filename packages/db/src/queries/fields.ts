// Query helpers for canonical fields
import { sql } from "drizzle-orm";
import type { Db } from "../client";
import { fields } from "../schema";

export type CanonicalFieldInput = {
	fieldPath: string;
	parentType: string;
	fieldName: string;
};

function toFieldRows(projectId: string, inputs: CanonicalFieldInput[]) {
	// Deduplicate by field path (a path appears once per version's introspection,
	// but defensive dedup keeps the batch conflict-free)
	const byPath = new Map<string, CanonicalFieldInput>();
	for (const input of inputs) {
		byPath.set(input.fieldPath, input);
	}

	return [...byPath.values()].map((input) => ({
		id: `${projectId}:${input.fieldPath}`,
		projectId,
		fieldPath: input.fieldPath,
		parentType: input.parentType,
		fieldName: input.fieldName,
	}));
}

/**
 * Upsert canonical field rows (stable across schema versions). The ID is
 * deterministic (`${projectId}:${fieldPath}`), so conflicts are resolved by
 * bumping `last_seen_at`. Used by the schema worker when a new version lands.
 */
export async function upsertFields(
	db: Db,
	projectId: string,
	inputs: CanonicalFieldInput[],
) {
	if (inputs.length === 0) return;

	await db
		.insert(fields)
		.values(toFieldRows(projectId, inputs))
		.onConflictDoUpdate({
			target: fields.id,
			set: { lastSeenAt: sql`now()` },
		});
}

/**
 * Insert canonical field rows only when missing (`ON CONFLICT DO NOTHING`) —
 * no row rewrites for the fields that already exist. Used by the logs worker
 * so every field referenced in traffic has a `fields` row, even when its
 * schema version has not landed yet (no `schema_fields` membership until a
 * version claims it).
 */
export async function ensureFields(
	db: Db,
	projectId: string,
	inputs: CanonicalFieldInput[],
) {
	if (inputs.length === 0) return;

	await db
		.insert(fields)
		.values(toFieldRows(projectId, inputs))
		.onConflictDoNothing();
}
