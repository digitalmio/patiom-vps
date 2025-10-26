import type {
	IntrospectionInputTypeRef,
	IntrospectionOutputTypeRef,
	IntrospectionQuery,
} from "graphql";
import { nanoid } from "nanoid";
import pino from "pino";
import { db, schema as dbSchema, eq } from "@/lib/db";
import { findExistingSchema } from "@/lib/db/queries/schema";
import { createDjb2Hash } from "@/lib/hash";

const logger = pino({
	name: "schema-processor",
	level: "debug",
});

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
	logger.debug({ schemaVersionId }, "extractAndInsertTypes: Starting");

	const types = introspection.__schema.types;

	if (!types) {
		logger.error("extractAndInsertTypes: types is undefined");
		throw new Error("introspection.__schema.types is undefined");
	}

	logger.debug(
		{ typesCount: types.length },
		"extractAndInsertTypes: Processing types",
	);

	// Filter out built-in types
	const customTypes = types.filter(
		(type) => !type.name.startsWith("__") && !BUILTIN_TYPES.has(type.name),
	);

	logger.debug(
		{ customTypesCount: customTypes.length },
		"extractAndInsertTypes: Found custom types",
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
		logger.debug(
			{ count: typesToInsert.length },
			"extractAndInsertTypes: Inserting types into database",
		);
		try {
			await db.insert(dbSchema.schemaTypes).values(typesToInsert);
			logger.debug("extractAndInsertTypes: Successfully inserted types");
		} catch (error) {
			logger.error(
				{ error, sampleData: typesToInsert[0] },
				"extractAndInsertTypes: Database error",
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
	logger.debug({ schemaVersionId }, "extractAndInsertFields: Starting");

	const types = introspection.__schema.types;

	if (!types) {
		logger.error("extractAndInsertFields: types is undefined");
		throw new Error("introspection.__schema.types is undefined");
	}

	// Filter types that can have fields (OBJECT and INTERFACE)
	const typesWithFields = types.filter(
		(type) =>
			(type.kind === "OBJECT" || type.kind === "INTERFACE") &&
			!type.name.startsWith("__") &&
			!BUILTIN_TYPES.has(type.name),
	);

	logger.debug(
		{ typesWithFieldsCount: typesWithFields.length },
		"extractAndInsertFields: Found types with potential fields",
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
		logger.debug(
			{ count: fieldsToInsert.length },
			"extractAndInsertFields: Inserting fields into database",
		);
		try {
			await db.insert(dbSchema.schemaFields).values(fieldsToInsert);
			logger.debug("extractAndInsertFields: Successfully inserted fields");
		} catch (error) {
			logger.error(
				{ error, sampleData: fieldsToInsert[0] },
				"extractAndInsertFields: Database error",
			);
			throw error;
		}
	} else {
		logger.debug("extractAndInsertFields: No fields to insert");
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
	logger.info({ projectId }, "processSchemaIntrospection: Starting");

	// Validate input
	if (!introspection) {
		logger.error("introspection is undefined");
		throw new Error("introspection is undefined");
	}

	if (!introspection.__schema) {
		logger.error("introspection.__schema is undefined");
		throw new Error("introspection.__schema is undefined");
	}

	// Generate hash to check if schema changed
	const schemaHash = generateSchemaHash(introspection);
	logger.debug({ schemaHash }, "Generated schema hash");

	const existing = await findExistingSchema(projectId, schemaHash);

	if (existing) {
		logger.info(
			{ schemaVersionId: existing.id, projectId },
			"Found existing schema version",
		);
		// Schema unchanged - no work needed
		return {
			schemaVersionId: existing.id,
			isNewVersion: false,
			typeCount: existing.typeCount || 0,
			fieldCount: existing.fieldCount || 0,
		};
	}

	logger.info("No existing schema found, creating new version");

	// Generate new schema version ID first
	const schemaVersionId = nanoid();
	logger.debug({ schemaVersionId }, "Generated new schema version ID");

	// Count operations
	const schema = introspection.__schema;
	let operationCount = 0;
	if (schema.queryType) operationCount++;
	if (schema.mutationType) operationCount++;
	if (schema.subscriptionType) operationCount++;

	logger.debug({ operationCount }, "Found operation types");

	// Create schema version record FIRST (so foreign keys work)
	logger.debug("Creating schema version record");
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
		logger.error({ error }, "Error creating schema version");
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
	logger.debug("Updating schema version with counts");
	await db
		.update(dbSchema.schemaVersions)
		.set({ typeCount, fieldCount })
		.where(eq(dbSchema.schemaVersions.id, schemaVersionId));

	logger.info({ typeCount, fieldCount }, "Successfully processed schema");

	return {
		schemaVersionId,
		isNewVersion: true,
		typeCount,
		fieldCount,
	};
}
