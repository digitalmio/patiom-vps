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

import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	date,
	index,
	integer,
	json,
	pgTable,
	pgView,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

import { projects } from "./app";

// Raw request logs (detailed per-request data)
// Will be converted to TimescaleDB hypertable for time-series optimization
export const requestLogs = pgTable("request_logs", {
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
});

export const requestLogsIndexes = {
	projectTimestampIdx: index("idx_request_logs_project_timestamp").on(
		requestLogs.projectId,
		requestLogs.timestamp,
	),
	projectOperationIdx: index("idx_request_logs_project_operation").on(
		requestLogs.projectId,
		requestLogs.operationName,
		requestLogs.timestamp,
	),
	projectStatusIdx: index("idx_request_logs_project_status").on(
		requestLogs.projectId,
		requestLogs.statusCode,
		requestLogs.timestamp,
	),
	datePartitionIdx: index("idx_request_logs_date_partition").on(
		requestLogs.datePartition,
		requestLogs.projectId,
	),
	operationHashIdx: index("idx_request_logs_operation_hash").on(
		requestLogs.projectId,
		requestLogs.responseHash,
	),
	// Note: GIN index for requested_fields array needs to be created via SQL
	// CREATE INDEX idx_request_logs_requested_fields ON request_logs USING GIN (requested_fields);
};

// TimescaleDB Continuous Aggregates (Materialized Views)
// Note: These views are created via SQL in timescale-init.sql
// Drizzle provides type-safe access to query them

// Hourly operation statistics (auto-refreshes every hour)
export const operationStatsHourly = pgView("operation_stats_hourly").as((qb) =>
	qb
		.select({
			bucket: sql<Date>`bucket`.as("bucket"),
			projectId: sql<string>`project_id`.as("project_id"),
			operationName: sql<string | null>`operation_name`.as("operation_name"),
			totalRequests: sql<number>`total_requests`.as("total_requests"),
			avgLatencyMs: sql<number>`avg_latency_ms`.as("avg_latency_ms"),
			minLatencyMs: sql<number>`min_latency_ms`.as("min_latency_ms"),
			maxLatencyMs: sql<number>`max_latency_ms`.as("max_latency_ms"),
			p50LatencyMs: sql<number>`p50_latency_ms`.as("p50_latency_ms"),
			p95LatencyMs: sql<number>`p95_latency_ms`.as("p95_latency_ms"),
			p99LatencyMs: sql<number>`p99_latency_ms`.as("p99_latency_ms"),
			totalResponseSizeBytes: sql<number>`total_response_size_bytes`.as(
				"total_response_size_bytes",
			),
			errorCount: sql<number>`error_count`.as("error_count"),
		})
		.from(sql`request_logs`),
);

// Daily operation statistics (auto-refreshes daily)
export const operationStatsDaily = pgView("operation_stats_daily").as((qb) =>
	qb
		.select({
			bucket: sql<Date>`bucket`.as("bucket"),
			projectId: sql<string>`project_id`.as("project_id"),
			operationName: sql<string | null>`operation_name`.as("operation_name"),
			totalRequests: sql<number>`total_requests`.as("total_requests"),
			avgLatencyMs: sql<number>`avg_latency_ms`.as("avg_latency_ms"),
			minLatencyMs: sql<number>`min_latency_ms`.as("min_latency_ms"),
			maxLatencyMs: sql<number>`max_latency_ms`.as("max_latency_ms"),
			p50LatencyMs: sql<number>`p50_latency_ms`.as("p50_latency_ms"),
			p95LatencyMs: sql<number>`p95_latency_ms`.as("p95_latency_ms"),
			p99LatencyMs: sql<number>`p99_latency_ms`.as("p99_latency_ms"),
			totalResponseSizeBytes: sql<number>`total_response_size_bytes`.as(
				"total_response_size_bytes",
			),
			errorCount: sql<number>`error_count`.as("error_count"),
		})
		.from(sql`request_logs`),
);

// Daily field usage statistics (auto-refreshes daily)
export const fieldUsageStatsDaily = pgView("field_usage_stats_daily").as((qb) =>
	qb
		.select({
			bucket: sql<Date>`bucket`.as("bucket"),
			projectId: sql<string>`project_id`.as("project_id"),
			fieldPath: sql<string>`field_path`.as("field_path"),
			totalRequests: sql<number>`total_requests`.as("total_requests"),
			totalLatencyMs: sql<number>`total_latency_ms`.as("total_latency_ms"),
			errorCount: sql<number>`error_count`.as("error_count"),
		})
		.from(sql`request_logs`),
);
