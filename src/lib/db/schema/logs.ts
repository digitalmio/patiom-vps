// GraphQL Analytics Logs Schema
// Note: These tables will be converted to TimescaleDB hypertables via migrations
// See sql/timescale-init.sql for TimescaleDB-specific features
//
// Architecture:
// 1. Raw logs stored in `request_logs` (TimescaleDB hypertable)
// 2. Aggregations handled by TimescaleDB Continuous Aggregates (auto-updating materialized views)
// 3. No manual cron jobs needed - TimescaleDB refreshes views automatically
//
// Available views (query like tables):
// - operation_stats_hourly: Hourly operation metrics
// - operation_stats_daily: Daily operation metrics
// - field_usage_stats_daily: Daily field usage across all operations

import {
	bigint,
	boolean,
	date,
	index,
	integer,
	json,
	pgTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

import { projects } from "./app";

// Raw request logs (detailed per-request data)
// Will be converted to TimescaleDB hypertable for time-series optimization
export const requestLogs = pgTable(
	"request_logs",
	{
		id: text("id").primaryKey(),
		timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),

		// GraphQL Operation
		operationName: varchar("operation_name", { length: 255 }),
		operation: text("operation").notNull(),
		variableHash: bigint("variable_hash", { mode: "number" }),

		// Performance
		elapsedMs: integer("elapsed_ms").notNull(),
		responseSizeBytes: integer("response_size_bytes"),
		responseHash: bigint("response_hash", { mode: "number" }).notNull(),

		// Client Info
		graphqlClientName: varchar("graphql_client_name", { length: 100 }),
		graphqlClientVersion: varchar("graphql_client_version", { length: 50 }),

		// Network
		method: varchar("method", { length: 10 }).default("POST").notNull(),
		statusCode: integer("status_code").default(200).notNull(),
		hasSetCookie: boolean("has_set_cookie").default(false),
		referer: text("referer"),
		userAgent: text("user_agent"),
		ip: varchar("ip", { length: 45 }), // IPv6 max length

		// Cache variation tracking
		varyHash: bigint("vary_hash", { mode: "number" }),

		// GraphQL Metrics
		errorCount: integer("error_count").default(0),
		errors:
			json("errors").$type<
				Array<{
					message: string;
					locations?: Array<{ line: number; column: number }>;
					path?: Array<string | number>;
				}>
			>(),

		// Parsed field usage (populated by worker after parsing GraphQL query)
		// e.g., ["Query.user", "User.id", "User.email", "User.posts", "Post.title"]
		requestedFields: json("requested_fields").$type<string[]>(),

		// Partitioning hint (generated column in Postgres)
		// Note: Generated columns are created via SQL, not through Drizzle directly
		// See migration file or timescale-init.sql for implementation
		datePartition: date("date_partition").notNull(),
	},
	(table) => [
		index("idx_request_logs_project_timestamp").on(
			table.projectId,
			table.timestamp,
		),
		index("idx_request_logs_project_operation").on(
			table.projectId,
			table.operationName,
			table.timestamp,
		),
		index("idx_request_logs_project_status").on(
			table.projectId,
			table.statusCode,
			table.timestamp,
		),
		index("idx_request_logs_date_partition").on(
			table.datePartition,
			table.projectId,
		),
		index("idx_request_logs_operation_hash").on(
			table.projectId,
			table.responseHash,
		),
		// Note: GIN index for requested_fields array needs to be created via SQL
		// CREATE INDEX idx_request_logs_requested_fields ON request_logs USING GIN (requested_fields);
	],
);

// TimescaleDB Continuous Aggregates (Materialized Views)
// These views are created via SQL in sql/timescale-init.sql
// They are NOT managed by Drizzle to avoid conflicts during migrations
//
// Available continuous aggregates:
// - operation_stats_hourly: Hourly operation metrics (auto-refreshes every hour)
// - operation_stats_daily: Daily operation metrics (auto-refreshes daily)
// - field_usage_stats_daily: Daily field usage across operations (auto-refreshes daily)
//
// Query them directly using sql`` or by defining types in your query layer
