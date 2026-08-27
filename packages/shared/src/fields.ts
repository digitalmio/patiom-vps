/**
 * Canonical field identity, stable across schema versions.
 *
 * The ID is fully deterministic (`${projectId}:${fieldPath}`), so log workers
 * can reference fields without any DB lookup — the `fields` row may be created
 * later by the schema worker.
 */
export function canonicalFieldId(projectId: string, fieldPath: string): string {
	return `${projectId}:${fieldPath}`;
}
