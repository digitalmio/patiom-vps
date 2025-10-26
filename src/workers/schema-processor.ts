import type {
	IntrospectionInputTypeRef,
	IntrospectionOutputTypeRef,
	IntrospectionQuery,
} from "graphql";
import { nanoid } from "nanoid";
import { db, schema as dbSchema, eq } from "@/lib/db";
import { findExistingSchema } from "@/lib/db/queries/schema";
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
	console.log(
		`[Schema Processor] extractAndInsertTypes: Starting for schema version ${schemaVersionId}`,
	);

	const types = introspection.__schema.types;

	if (!types) {
		console.error(
			`[Schema Processor] extractAndInsertTypes: types is undefined`,
		);
		throw new Error("introspection.__schema.types is undefined");
	}

	console.log(
		`[Schema Processor] extractAndInsertTypes: Processing ${types.length} types`,
	);

	// Filter out built-in types
	const customTypes = types.filter(
		(type) => !type.name.startsWith("__") && !BUILTIN_TYPES.has(type.name),
	);

	console.log(
		`[Schema Processor] extractAndInsertTypes: Found ${customTypes.length} custom types`,
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
		console.log(
			`[Schema Processor] extractAndInsertTypes: Inserting ${typesToInsert.length} types into database`,
		);
		try {
			await db.insert(dbSchema.schemaTypes).values(typesToInsert);
			console.log(
				`[Schema Processor] extractAndInsertTypes: Successfully inserted types`,
			);
		} catch (error) {
			console.error(
				`[Schema Processor] extractAndInsertTypes: Database error:`,
				error,
			);
			console.error(
				`[Schema Processor] extractAndInsertTypes: Sample data:`,
				JSON.stringify(typesToInsert[0], null, 2),
			);
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
	introspection: IntrospectionQuery,
	schemaVersionId: string,
	projectId: string,
) {
	console.log(
		`[Schema Processor] extractAndInsertFields: Starting for schema version ${schemaVersionId}`,
	);

	const types = introspection.__schema.types;

	if (!types) {
		console.error(
			`[Schema Processor] extractAndInsertFields: types is undefined`,
		);
		throw new Error("introspection.__schema.types is undefined");
	}

	// Filter types that can have fields (OBJECT and INTERFACE)
	const typesWithFields = types.filter(
		(type) =>
			(type.kind === "OBJECT" || type.kind === "INTERFACE") &&
			!type.name.startsWith("__") &&
			!BUILTIN_TYPES.has(type.name),
	);

	console.log(
		`[Schema Processor] extractAndInsertFields: Found ${typesWithFields.length} types with potential fields`,
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
		console.log(
			`[Schema Processor] extractAndInsertFields: Inserting ${fieldsToInsert.length} fields into database`,
		);
		try {
			await db.insert(dbSchema.schemaFields).values(fieldsToInsert);
			console.log(
				`[Schema Processor] extractAndInsertFields: Successfully inserted fields`,
			);
		} catch (error) {
			console.error(
				`[Schema Processor] extractAndInsertFields: Database error:`,
				error,
			);
			console.error(
				`[Schema Processor] extractAndInsertFields: Sample data:`,
				JSON.stringify(fieldsToInsert[0], null, 2),
			);
			throw error;
		}
	} else {
		console.log(
			`[Schema Processor] extractAndInsertFields: No fields to insert`,
		);
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
	console.log(
		`[Schema Processor] processSchemaIntrospection: Starting for project ${projectId}`,
	);

	// Validate input
	if (!introspection) {
		console.error(`[Schema Processor] introspection is undefined`);
		throw new Error("introspection is undefined");
	}

	if (!introspection.__schema) {
		console.error(`[Schema Processor] introspection.__schema is undefined`);
		throw new Error("introspection.__schema is undefined");
	}

	// Generate hash to check if schema changed
	const schemaHash = generateSchemaHash(introspection);
	console.log(`[Schema Processor] Generated schema hash: ${schemaHash}`);

	const existing = await findExistingSchema(projectId, schemaHash);

	if (existing) {
		console.log(
			`[Schema Processor] Found existing schema version ${existing.id} for project ${projectId}`,
		);
		// Schema unchanged - no work needed
		return {
			schemaVersionId: existing.id,
			isNewVersion: false,
			typeCount: existing.typeCount || 0,
			fieldCount: existing.fieldCount || 0,
		};
	}

	console.log(
		`[Schema Processor] No existing schema found, creating new version`,
	);

	// Generate new schema version ID first
	const schemaVersionId = nanoid();
	console.log(
		`[Schema Processor] Generated new schema version ID: ${schemaVersionId}`,
	);

	// Count operations
	const schema = introspection.__schema;
	let operationCount = 0;
	if (schema.queryType) operationCount++;
	if (schema.mutationType) operationCount++;
	if (schema.subscriptionType) operationCount++;

	console.log(`[Schema Processor] Found ${operationCount} operation types`);

	// Create schema version record FIRST (so foreign keys work)
	console.log(`[Schema Processor] Creating schema version record`);
	try {
		await db.insert(dbSchema.schemaVersions).values({
			id: schemaVersionId,
			projectId,
			schemaHash,
			typeCount: 0, // Will update later
			fieldCount: 0, // Will update later
			operationCount,
			introspectionData: introspection,
		});
	} catch (error) {
		console.error(`[Schema Processor] Error creating schema version:`, error);
		throw error;
	}

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

	// Update schema version with counts
	console.log(`[Schema Processor] Updating schema version with counts`);
	await db
		.update(dbSchema.schemaVersions)
		.set({ typeCount, fieldCount })
		.where(eq(dbSchema.schemaVersions.id, schemaVersionId));

	// Update project's latest schema hash for quick lookups
	console.log(`[Schema Processor] Updating project's latest schema hash`);
	await db
		.update(dbSchema.projects)
		.set({ latestSchemaHash: schemaHash.toString() })
		.where(eq(dbSchema.projects.id, projectId));

	console.log(
		`[Schema Processor] Successfully processed schema: ${typeCount} types, ${fieldCount} fields`,
	);

	return {
		schemaVersionId,
		isNewVersion: true,
		typeCount,
		fieldCount,
	};
}
