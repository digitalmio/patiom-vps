// GraphQL Query Parser - Extract field paths from GraphQL operations
import {
	type DocumentNode,
	type IntrospectionQuery,
	parse,
	visit,
} from "graphql";

interface TypeMap {
	[typeName: string]: {
		[fieldName: string]: string; // fieldName -> returnTypeName
	};
}

/**
 * Build a type map from schema introspection for fast field->type lookups
 */
function buildTypeMap(introspection: IntrospectionQuery): TypeMap {
	const typeMap: TypeMap = {};

	for (const type of introspection.__schema.types) {
		if (
			type.kind === "OBJECT" ||
			type.kind === "INTERFACE" ||
			type.kind === "INPUT_OBJECT"
		) {
			typeMap[type.name] = {};

			if ("fields" in type && type.fields) {
				for (const field of type.fields) {
					// Get the named type (unwrap NON_NULL and LIST wrappers)
					let fieldType = field.type;
					while (fieldType.kind === "NON_NULL" || fieldType.kind === "LIST") {
						// biome-ignore lint: ofType is guaranteed to exist for NON_NULL and LIST
						fieldType = fieldType.ofType!;
					}
					typeMap[type.name][field.name] = fieldType.name;
				}
			}
		}
	}

	return typeMap;
}

/**
 * Parse a GraphQL query/mutation and extract all requested field paths
 * Returns paths like: ["Query.users", "User.id", "User.name", "User.posts", "Post.title"]
 */
export function extractFieldPaths(
	operation: string,
	operationName?: string | null,
	introspection?: IntrospectionQuery | null,
): string[] {
	const fieldPaths: string[] = [];
	const fieldPathsSet = new Set<string>(); // Avoid duplicates

	try {
		const ast: DocumentNode = parse(operation);

		// Build type map if introspection is provided
		const typeMap = introspection ? buildTypeMap(introspection) : null;

		// Determine the root operation type (Query, Mutation, Subscription)
		let rootType = "Query"; // Default
		visit(ast, {
			OperationDefinition(node) {
				// If operation name is specified, only process that operation
				if (operationName && node.name?.value !== operationName) {
					return false; // Skip this operation
				}

				// Determine root type based on operation
				if (node.operation === "mutation") {
					rootType = "Mutation";
				} else if (node.operation === "subscription") {
					rootType = "Subscription";
				} else {
					rootType = "Query";
				}
			},
		});

		// Track current type context as we traverse
		const typeStack: string[] = [rootType];

		// Walk the AST and collect field paths
		visit(ast, {
			Field: {
				enter(node) {
					const fieldName = node.name.value;

					// Skip introspection fields
					if (fieldName.startsWith("__")) {
						return false;
					}

					const currentType = typeStack[typeStack.length - 1];
					const fieldPath = `${currentType}.${fieldName}`;

					// Add to results
					if (!fieldPathsSet.has(fieldPath)) {
						fieldPathsSet.add(fieldPath);
						fieldPaths.push(fieldPath);
					}

					// Push the return type onto the stack for nested fields
					if (typeMap?.[currentType]?.[fieldName]) {
						typeStack.push(typeMap[currentType][fieldName]);
					} else {
						// Fallback: keep current type (we don't know the return type)
						typeStack.push(currentType);
					}
				},
				leave() {
					// Pop the type stack when leaving a field
					typeStack.pop();
				},
			},
		});

		return fieldPaths;
	} catch (error) {
		// Invalid GraphQL - return empty array
		console.error("Failed to parse GraphQL operation:", error);
		return [];
	}
}

/**
 * Extract the operation type from a GraphQL operation
 * Returns "query", "mutation", "subscription", or null if unable to determine
 */
export function extractOperationType(
	operation: string,
	operationName?: string | null,
): "query" | "mutation" | "subscription" | null {
	try {
		const ast: DocumentNode = parse(operation);

		let operationType: "query" | "mutation" | "subscription" | null = null;

		visit(ast, {
			OperationDefinition(node) {
				// If operation name is specified, only process that operation
				if (operationName && node.name?.value !== operationName) {
					return false; // Skip this operation
				}

				// Extract the operation type
				operationType = node.operation;
				return false; // Stop visiting once we found it
			},
		});

		return operationType;
	} catch (error) {
		// Invalid GraphQL - return null
		console.error("Failed to parse GraphQL operation:", error);
		return null;
	}
}
