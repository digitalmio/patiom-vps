import {
	bigint,
	boolean,
	index,
	integer,
	json,
	pgTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

import { projects } from "./app";

// THIS IS FOR GRAPHQL SCHEMA TABLES, NOT WHOLE DB SCHEMA

// Schema versions (track schema evolution)
export const schemaVersions = pgTable(
	"schema_versions",
	{
		id: text("id").primaryKey(), // nanoid or similar
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		schemaHash: integer("schema_hash").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		isActive: boolean("is_active").default(true),

		// Schema metadata
		typeCount: integer("type_count"),
		fieldCount: integer("field_count"),
		operationCount: integer("operation_count"),

		// Change detection
		previousVersionId: text("previous_version_id"),
		changesSummary: json("changes_summary").$type<{
			addedTypes?: string[];
			removedTypes?: string[];
			addedFields?: string[];
			removedFields?: string[];
			deprecatedFields?: string[];
		}>(),

		// Store full introspection for reference
		introspectionData: json("introspection_data"),
	},
	(table) => [
		index("idx_schema_versions_project_active").on(
			table.projectId,
			table.isActive,
		),
	],
);

// Schema types (populated from schema introspection)
export const schemaTypes = pgTable(
	"schema_types",
	{
		id: text("id").primaryKey(), // composite: schema_version_id:type_name
		typeName: varchar("type_name", { length: 255 }).notNull(),
		typeKind: varchar("type_kind", { length: 50 }).notNull(), // OBJECT, SCALAR, ENUM, INTERFACE, UNION
		description: text("description"),
		fieldCount: integer("field_count").default(0),
		isBuiltin: boolean("is_builtin").default(false),
		schemaVersionId: text("schema_version_id")
			.notNull()
			.references(() => schemaVersions.id, { onDelete: "cascade" }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),

		// Usage analytics (updated periodically)
		totalRequests: integer("total_requests").default(0),
		lastSeen: timestamp("last_seen"),
	},
	(table) => [
		index("idx_schema_types_version").on(table.schemaVersionId),
		index("idx_schema_types_project").on(table.projectId),
	],
);

// Schema fields (populated from schema introspection)
export const schemaFields = pgTable(
	"schema_fields",
	{
		id: text("id").primaryKey(), // composite: schema_version_id:parent_type:field_name
		fieldName: varchar("field_name", { length: 255 }).notNull(),
		fieldPath: varchar("field_path", { length: 512 }).notNull(), // "Product.price", "Query.allProducts"
		parentType: varchar("parent_type", { length: 255 }).notNull(),
		returnType: varchar("return_type", { length: 255 }).notNull(),
		isList: boolean("is_list").default(false),
		isNullable: boolean("is_nullable").default(true),
		hasArguments: boolean("has_arguments").default(false),
		argumentCount: integer("argument_count").default(0),
		arguments:
			json("arguments").$type<
				Array<{
					name: string;
					type: string;
					defaultValue?: string;
					description?: string;
				}>
			>(),
		description: text("description"),
		deprecationReason: text("deprecation_reason"),
		schemaVersionId: text("schema_version_id")
			.notNull()
			.references(() => schemaVersions.id, { onDelete: "cascade" }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),

		// Usage analytics (updated periodically)
		totalRequests: integer("total_requests").default(0),
		totalLatencyMs: bigint("total_latency_ms", { mode: "number" }).default(0),
		errorCount: integer("error_count").default(0),
		lastSeen: timestamp("last_seen"),
	},
	(table) => [
		index("idx_schema_fields_version").on(table.schemaVersionId),
		index("idx_schema_fields_project").on(table.projectId),
		index("idx_schema_fields_path").on(table.fieldPath),
	],
);
