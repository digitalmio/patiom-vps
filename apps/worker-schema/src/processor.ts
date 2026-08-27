import {
	activateSchemaVersion,
	and,
	type Db,
	schema as dbSchema,
	desc,
	eq,
	findExistingSchema,
	isNull,
	ne,
	upsertFields,
} from "@patiom/db";
import { canonicalFieldId, createDjb2Hash } from "@patiom/shared";
import type {
	IntrospectionInputTypeRef,
	IntrospectionOutputTypeRef,
	IntrospectionQuery,
} from "graphql";

// GraphQL built-in types to skip
const BUILTIN_TYPES = new Set([
	"__Schema",
	"__Type",
	"__TypeKind",
	"__Field",
	"__InputValue",
	"__EnumValue",
	"__Directive",
	"__DirectiveLocation",
	"String",
	"Int",
	"Float",
	"Boolean",
	"ID",
]);

export async function extractAndInsertTypes(
	db: Db,
	introspection: IntrospectionQuery,
	schemaVersionId: string,
	projectId: string,
) {
	const types = introspection.__schema.types;

	if (!types) {
		throw new Error("introspection.__schema.types is undefined");
	}

	// Filter out built-in types
	const customTypes = types.filter(
		(type) => !type.name.startsWith("__") && !BUILTIN_TYPES.has(type.name),
	);

	// Prepare batch insert data
	const typesToInsert = customTypes.map((type) => {
		const fieldCount = "fields" in type && type.fields ? type.fields.length : 0;

		return {
			id: `${schemaVersionId}:${type.name}`,
			typeName: type.name,
			typeKind: type.kind,
			description: type.description || null,
			fieldCount,
			isBuiltin: false,
			schemaVersionId,
			projectId,
		};
	});

	// Batch insert all types
	if (typesToInsert.length > 0) {
		try {
			await db.insert(dbSchema.schemaTypes).values(typesToInsert);
		} catch (error) {
			console.error("extractAndInsertTypes: Database error", error);
			throw error;
		}
	}

	return typesToInsert.length;
}

// Helper to get the string representation of a GraphQL type
function getTypeString(
	type: IntrospectionOutputTypeRef | IntrospectionInputTypeRef,
): string {
	if (type.kind === "NON_NULL") {
		return `${getTypeString(type.ofType)}!`;
	}
	if (type.kind === "LIST") {
		return `[${getTypeString(type.ofType)}]`;
	}
	return type.name;
}

export async function extractAndInsertFields(
	db: Db,
	introspection: IntrospectionQuery,
	schemaVersionId: string,
	projectId: string,
) {
	const types = introspection.__schema.types;

	if (!types) {
		throw new Error("introspection.__schema.types is undefined");
	}

	// Filter types that can have fields (OBJECT and INTERFACE)
	const typesWithFields = types.filter(
		(type) =>
			(type.kind === "OBJECT" || type.kind === "INTERFACE") &&
			!type.name.startsWith("__") &&
			!BUILTIN_TYPES.has(type.name),
	);

	const fieldsToInsert = [];

	for (const type of typesWithFields) {
		if (!("fields" in type) || !type.fields) continue;

		for (const field of type.fields) {
			const returnTypeString = getTypeString(field.type);
			const isList = returnTypeString.includes("[");
			const isNullable = !returnTypeString.includes("!");
			const fieldPath = `${type.name}.${field.name}`;

			// Extract arguments
			const args = field.args?.map((arg) => ({
				name: arg.name,
				type: getTypeString(arg.type),
				defaultValue: arg.defaultValue || undefined,
				description: arg.description || undefined,
			}));

			fieldsToInsert.push({
				id: `${schemaVersionId}:${type.name}:${field.name}`,
				fieldId: canonicalFieldId(projectId, fieldPath),
				fieldName: field.name,
				fieldPath,
				parentType: type.name,
				returnType: returnTypeString,
				isList,
				isNullable,
				hasArguments: args && args.length > 0,
				argumentCount: args?.length || 0,
				arguments: args && args.length > 0 ? args : null,
				description: field.description || null,
				deprecationReason: field.deprecationReason || null,
				schemaVersionId,
				projectId,
			});
		}
	}

	// Upsert canonical fields first (schema_fields.field_id is a foreign key),
	// then batch insert per-version fields
	if (fieldsToInsert.length > 0) {
		try {
			await upsertFields(
				db,
				projectId,
				fieldsToInsert.map((field) => ({
					fieldPath: field.fieldPath,
					parentType: field.parentType,
					fieldName: field.fieldName,
				})),
			);
			await db.insert(dbSchema.schemaFields).values(fieldsToInsert);
		} catch (error) {
			console.error("extractAndInsertFields: Database error", error);
			throw error;
		}
	}

	return fieldsToInsert.length;
}

export function generateSchemaHash(introspection: IntrospectionQuery): number {
	const schemaString = JSON.stringify(introspection);
	return createDjb2Hash(schemaString);
}

// Main function to process schema introspection
export async function processSchemaIntrospection(
	db: Db,
	introspection: IntrospectionQuery,
	projectId: string,
) {
	// Validate input
	if (!introspection) {
		throw new Error("introspection is undefined");
	}

	if (!introspection.__schema) {
		throw new Error("introspection.__schema is undefined");
	}

	// Generate hash to check if schema changed
	const schemaHash = generateSchemaHash(introspection);

	const existing = await findExistingSchema(db, projectId, schemaHash);

	if (existing) {
		// Schema unchanged — make sure this version is the project's current one.
		// Re-deploying a previous schema (A→B→A) bumps activated_at so it becomes
		// active again; the statement no-ops when this version is already newest.
		await activateSchemaVersion(db, existing.id);

		return {
			schemaVersionId: existing.id,
			isNewVersion: false,
			typeCount: existing.typeCount || 0,
			fieldCount: existing.fieldCount || 0,
		};
	}

	// Count operations
	const schema = introspection.__schema;
	let operationCount = 0;
	if (schema.queryType) operationCount++;
	if (schema.mutationType) operationCount++;
	if (schema.subscriptionType) operationCount++;

	// Create schema version record FIRST (so foreign keys work)
	const [{ id: schemaVersionId }] = await db
		.insert(dbSchema.schemaVersions)
		.values({
			projectId,
			schemaHash,
			typeCount: 0, // Will update later
			fieldCount: 0, // Will update later
			operationCount,
			introspectionData: introspection,
		})
		.returning({ id: dbSchema.schemaVersions.id });

	// Extract and insert types
	const typeCount = await extractAndInsertTypes(
		db,
		introspection,
		schemaVersionId,
		projectId,
	);

	// Extract and insert fields
	const fieldCount = await extractAndInsertFields(
		db,
		introspection,
		schemaVersionId,
		projectId,
	);

	// Update schema version with counts
	await db
		.update(dbSchema.schemaVersions)
		.set({ typeCount, fieldCount })
		.where(eq(dbSchema.schemaVersions.id, schemaVersionId));

	// Record the diff against the previous version
	const changesSummary = await computeChangesSummary(
		db,
		projectId,
		schemaVersionId,
	);
	if (changesSummary) {
		await db
			.update(dbSchema.schemaVersions)
			.set({ changesSummary })
			.where(eq(dbSchema.schemaVersions.id, schemaVersionId));
	}

	return {
		schemaVersionId,
		isNewVersion: true,
		typeCount,
		fieldCount,
	};
}

/**
 * Diff the new schema version against the previously active one and produce a
 * changes summary (added/removed types and fields by stable field path).
 */
async function computeChangesSummary(
	db: Db,
	projectId: string,
	newVersionId: string,
) {
	const previous = await db.query.schemaVersions.findFirst({
		where: and(
			eq(dbSchema.schemaVersions.projectId, projectId),
			ne(dbSchema.schemaVersions.id, newVersionId),
			isNull(dbSchema.schemaVersions.deletedAt),
		),
		orderBy: desc(dbSchema.schemaVersions.activatedAt),
	});

	if (!previous) return null;

	const [previousFields, previousTypes] = await Promise.all([
		db
			.select({ fieldPath: dbSchema.schemaFields.fieldPath })
			.from(dbSchema.schemaFields)
			.where(eq(dbSchema.schemaFields.schemaVersionId, previous.id)),
		db
			.select({ typeName: dbSchema.schemaTypes.typeName })
			.from(dbSchema.schemaTypes)
			.where(eq(dbSchema.schemaTypes.schemaVersionId, previous.id)),
	]);
	const [currentFields, currentTypes] = await Promise.all([
		db
			.select({ fieldPath: dbSchema.schemaFields.fieldPath })
			.from(dbSchema.schemaFields)
			.where(eq(dbSchema.schemaFields.schemaVersionId, newVersionId)),
		db
			.select({ typeName: dbSchema.schemaTypes.typeName })
			.from(dbSchema.schemaTypes)
			.where(eq(dbSchema.schemaTypes.schemaVersionId, newVersionId)),
	]);

	const previousFieldPaths = new Set(previousFields.map((f) => f.fieldPath));
	const currentFieldPaths = new Set(currentFields.map((f) => f.fieldPath));
	const previousTypeNames = new Set(previousTypes.map((t) => t.typeName));
	const currentTypeNames = new Set(currentTypes.map((t) => t.typeName));

	return {
		addedTypes: setDifference(currentTypeNames, previousTypeNames),
		removedTypes: setDifference(previousTypeNames, currentTypeNames),
		addedFields: setDifference(currentFieldPaths, previousFieldPaths),
		removedFields: setDifference(previousFieldPaths, currentFieldPaths),
	} satisfies {
		addedTypes?: string[];
		removedTypes?: string[];
		addedFields?: string[];
		removedFields?: string[];
	};
}

function setDifference(set: Set<string>, exclude: Set<string>): string[] {
	return [...set].filter((value) => !exclude.has(value));
}
