import type {
	IntrospectionInputTypeRef,
	IntrospectionOutputTypeRef,
	IntrospectionQuery,
} from "graphql";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { findExistingSchema } from "@/lib/db/queries/schema";
import { schemaFields, schemaTypes, schemaVersions } from "@/lib/db/schema";
import { createDjb2Hash } from "@/lib/hash";

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
	introspection: IntrospectionQuery,
	schemaVersionId: string,
	projectId: string,
) {
	const types = introspection.__schema.types;

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
		await db.insert(schemaTypes).values(typesToInsert);
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
	introspection: IntrospectionQuery,
	schemaVersionId: string,
	projectId: string,
) {
	const types = introspection.__schema.types;

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

			// Extract arguments
			const args = field.args?.map((arg) => ({
				name: arg.name,
				type: getTypeString(arg.type),
				defaultValue: arg.defaultValue || undefined,
				description: arg.description || undefined,
			}));

			fieldsToInsert.push({
				id: `${schemaVersionId}:${type.name}:${field.name}`,
				fieldName: field.name,
				fieldPath: `${type.name}.${field.name}`,
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

	// Batch insert all fields
	if (fieldsToInsert.length > 0) {
		await db.insert(schemaFields).values(fieldsToInsert);
	}

	return fieldsToInsert.length;
}

export function generateSchemaHash(introspection: IntrospectionQuery): number {
	const schemaString = JSON.stringify(introspection);
	return createDjb2Hash(schemaString);
}

// Main function to process schema introspection
export async function processSchemaIntrospection(
	introspection: IntrospectionQuery,
	projectId: string,
) {
	// Generate hash to check if schema changed
	const schemaHash = generateSchemaHash(introspection);
	const existing = await findExistingSchema(projectId, schemaHash);

	if (existing) {
		// Schema unchanged - no work needed
		return {
			schemaVersionId: existing.id,
			isNewVersion: false,
			typeCount: existing.typeCount || 0,
			fieldCount: existing.fieldCount || 0,
		};
	}

	// Generate new schema version ID first
	const schemaVersionId = nanoid();

	// Count operations
	const schema = introspection.__schema;
	let operationCount = 0;
	if (schema.queryType) operationCount++;
	if (schema.mutationType) operationCount++;
	if (schema.subscriptionType) operationCount++;

	// Extract and insert types
	const typeCount = await extractAndInsertTypes(
		introspection,
		schemaVersionId,
		projectId,
	);

	// Extract and insert fields
	const fieldCount = await extractAndInsertFields(
		introspection,
		schemaVersionId,
		projectId,
	);

	// Create schema version record
	await db.insert(schemaVersions).values({
		id: schemaVersionId,
		projectId,
		schemaHash,
		typeCount,
		fieldCount,
		operationCount,
		introspectionData: introspection,
	});

	return {
		schemaVersionId,
		isNewVersion: true,
		typeCount,
		fieldCount,
	};
}
