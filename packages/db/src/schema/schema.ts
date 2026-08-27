import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	index,
	integer,
	json,
	pgTable,
	pgView,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { projects } from "./app";

// THIS IS FOR GRAPHQL SCHEMA TABLES, NOT WHOLE DB SCHEMA

// Schema versions (track schema evolution)
export const schemaVersions = pgTable(
	"schema_versions",
	{
		id: text("id")
			.$defaultFn(() => nanoid())
			.primaryKey(), // nanoid or similar
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		schemaHash: integer("schema_hash").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		// When this version last became the project's current schema. The active
		// version is the one with the highest activated_at — re-deploying a
		// previous schema (A→B→A) simply bumps its activated_at.
		activatedAt: timestamp("activated_at").defaultNow().notNull(),
		// Soft-delete marker (rows are never hard-deleted)
		deletedAt: timestamp("deleted_at"),

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
		index("idx_schema_versions_project_activated").on(
			table.projectId,
			table.activatedAt,
		),
	],
);

// Canonical field identity, stable across schema versions.
// The ID is deterministic: `${projectId}:${fieldPath}` (e.g. "prj_x:Book.price"),
// so log workers can reference fields without any DB lookup. Per-version
// metadata (return type, arguments, deprecation) lives in `schema_fields`.
export const fields = pgTable(
	"fields",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		fieldPath: varchar("field_path", { length: 512 }).notNull(),
		parentType: varchar("parent_type", { length: 255 }).notNull(),
		fieldName: varchar("field_name", { length: 255 }).notNull(),
		firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
		lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		index("idx_fields_project").on(table.projectId),
		index("idx_fields_path").on(table.fieldPath),
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
		// Soft-delete marker (rows are never hard-deleted)
		deletedAt: timestamp("deleted_at"),

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
		// Reference to the canonical `fields` row (stable across versions)
		fieldId: text("field_id")
			.notNull()
			.references(() => fields.id, { onDelete: "cascade" }),
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
		// Soft-delete marker (rows are never hard-deleted)
		deletedAt: timestamp("deleted_at"),

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

// Cross-version field presence: for every canonical field, which schema
// versions contained it and when it was first/last seen.
export const fieldVersionPresence = pgView("field_version_presence", {
	fieldId: text("field_id").notNull(),
	projectId: text("project_id").notNull(),
	fieldPath: varchar("field_path", { length: 512 }).notNull(),
	parentType: varchar("parent_type", { length: 255 }).notNull(),
	fieldName: varchar("field_name", { length: 255 }).notNull(),
	versionIds: text("version_ids").array().notNull(),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
}).as(sql`
	SELECT
		f.id AS field_id,
		f.project_id,
		f.field_path,
		f.parent_type,
		f.field_name,
		ARRAY_AGG(sf.schema_version_id ORDER BY sv.activated_at) AS version_ids,
		MIN(sv.activated_at) AS first_seen_at,
		MAX(sv.activated_at) AS last_seen_at
	FROM fields f
	JOIN schema_fields sf ON sf.field_id = f.id AND sf.deleted_at IS NULL
	JOIN schema_versions sv ON sv.id = sf.schema_version_id AND sv.deleted_at IS NULL
	WHERE f.deleted_at IS NULL
	GROUP BY f.id, f.project_id, f.field_path, f.parent_type, f.field_name
`);
