// GraphQL Analytics Logs Schema
//
// Plain Postgres (no TimescaleDB). Aggregations are defined as regular views
// that are recomputed on query — fine for the starter, and replace the old
// TimescaleDB Continuous Aggregates:
//
// Available views (query like tables):
// - operation_stats_hourly: Hourly operation metrics
// - operation_stats_daily: Daily operation metrics
// - field_usage_stats_daily: Daily field usage across all operations
//   (grouped by canonical field ID — stable across schema versions)
// - schema_usage_daily: Daily request counts per schema version
// - recent_operations: Operation metrics for the last 24 hours
// - error_logs: Rows that reported at least one GraphQL error

import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	pgView,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { projects } from "./app";

// Raw request logs (detailed per-request data)
export const requestLogs = pgTable(
	"request_logs",
	{
		id: text("id")
			.$defaultFn(() => nanoid())
			.primaryKey(),
		timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),

		// Schema tracking - which schema version was active when this request happened
		schemaVersionId: text("schema_version_id"),

		// GraphQL Operation
		operationType: varchar("operation_type", { length: 20 }), // query, mutation, subscription
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

		// Parsed User Agent (from bowser)
		browserName: varchar("browser_name", { length: 50 }),
		browserVersion: varchar("browser_version", { length: 20 }),
		osName: varchar("os_name", { length: 50 }),
		osVersion: varchar("os_version", { length: 20 }),
		platformType: varchar("platform_type", { length: 20 }), // desktop, mobile, tablet, tv

		// Parsed Geolocation (from IPLocate)
		countryCode: varchar("country_code", { length: 2 }), // ISO 3166-1 alpha-2
		countryName: varchar("country_name", { length: 100 }),
		city: varchar("city", { length: 100 }),

		// Cache variation tracking
		varyHash: bigint("vary_hash", { mode: "number" }),

		// GraphQL Metrics
		errorCount: integer("error_count").default(0),
		errors:
			jsonb("errors").$type<
				Array<{
					message: string;
					locations?: Array<{ line: number; column: number }>;
					path?: Array<string | number>;
				}>
			>(),

		// Parsed field usage (populated by worker after parsing GraphQL query)
		// Array of schema_fields.id references for fields used in this request
		// Allows direct joins to schema_fields for analytics
		requestedFieldIds: jsonb("requested_field_ids").$type<string[]>(),
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
		index("idx_request_logs_project_operation_type").on(
			table.projectId,
			table.operationType,
			table.timestamp,
		),
		index("idx_request_logs_project_status").on(
			table.projectId,
			table.statusCode,
			table.timestamp,
		),
		index("idx_request_logs_operation_hash").on(
			table.projectId,
			table.responseHash,
		),
		// Analytics indexes
		index("idx_request_logs_country").on(
			table.projectId,
			table.countryCode,
			table.timestamp,
		),
		index("idx_request_logs_browser").on(
			table.projectId,
			table.browserName,
			table.timestamp,
		),
		// GIN index for JSONB array field queries (e.g., find all requests using a specific field ID)
		index("idx_request_logs_requested_field_ids").using(
			"gin",
			table.requestedFieldIds,
		),
	],
);

// Aggregation views (recomputed on each query — no background jobs needed)

export const operationStatsHourly = pgView("operation_stats_hourly", {
	bucket: timestamp("bucket", { withTimezone: true }).notNull(),
	projectId: text("project_id").notNull(),
	operationName: varchar("operation_name", { length: 255 }),
	totalRequests: bigint("total_requests", { mode: "number" }).notNull(),
	avgLatencyMs: doublePrecision("avg_latency_ms"),
	minLatencyMs: integer("min_latency_ms"),
	maxLatencyMs: integer("max_latency_ms"),
	p50LatencyMs: doublePrecision("p50_latency_ms"),
	p95LatencyMs: doublePrecision("p95_latency_ms"),
	p99LatencyMs: doublePrecision("p99_latency_ms"),
	totalResponseSizeBytes: bigint("total_response_size_bytes", {
		mode: "number",
	}),
	errorCount: bigint("error_count", { mode: "number" }),
}).as(sql`
	SELECT
		date_trunc('hour', timestamp) AS bucket,
		project_id,
		operation_name,
		COUNT(*) AS total_requests,
		AVG(elapsed_ms) AS avg_latency_ms,
		MIN(elapsed_ms) AS min_latency_ms,
		MAX(elapsed_ms) AS max_latency_ms,
		PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY elapsed_ms) AS p50_latency_ms,
		PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY elapsed_ms) AS p95_latency_ms,
		PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY elapsed_ms) AS p99_latency_ms,
		SUM(response_size_bytes) AS total_response_size_bytes,
		SUM(error_count) AS error_count
	FROM request_logs
	GROUP BY bucket, project_id, operation_name
`);

export const operationStatsDaily = pgView("operation_stats_daily", {
	bucket: timestamp("bucket", { withTimezone: true }).notNull(),
	projectId: text("project_id").notNull(),
	operationName: varchar("operation_name", { length: 255 }),
	totalRequests: bigint("total_requests", { mode: "number" }).notNull(),
	avgLatencyMs: doublePrecision("avg_latency_ms"),
	minLatencyMs: integer("min_latency_ms"),
	maxLatencyMs: integer("max_latency_ms"),
	p50LatencyMs: doublePrecision("p50_latency_ms"),
	p95LatencyMs: doublePrecision("p95_latency_ms"),
	p99LatencyMs: doublePrecision("p99_latency_ms"),
	totalResponseSizeBytes: bigint("total_response_size_bytes", {
		mode: "number",
	}),
	errorCount: bigint("error_count", { mode: "number" }),
}).as(sql`
	SELECT
		date_trunc('day', timestamp) AS bucket,
		project_id,
		operation_name,
		COUNT(*) AS total_requests,
		AVG(elapsed_ms) AS avg_latency_ms,
		MIN(elapsed_ms) AS min_latency_ms,
		MAX(elapsed_ms) AS max_latency_ms,
		PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY elapsed_ms) AS p50_latency_ms,
		PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY elapsed_ms) AS p95_latency_ms,
		PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY elapsed_ms) AS p99_latency_ms,
		SUM(response_size_bytes) AS total_response_size_bytes,
		SUM(error_count) AS error_count
	FROM request_logs
	GROUP BY bucket, project_id, operation_name
`);

export const fieldUsageStatsDaily = pgView("field_usage_stats_daily", {
	bucket: timestamp("bucket", { withTimezone: true }).notNull(),
	projectId: text("project_id").notNull(),
	fieldId: text("field_id").notNull(),
	fieldPath: varchar("field_path", { length: 512 }).notNull(),
	usageCount: bigint("usage_count", { mode: "number" }).notNull(),
}).as(sql`
	SELECT
		date_trunc('day', rl.timestamp) AS bucket,
		rl.project_id,
		f.id AS field_id,
		f.field_path,
		COUNT(*) AS usage_count
	FROM request_logs rl,
		jsonb_array_elements_text(rl.requested_field_ids) AS requested_field_id
	JOIN fields f ON f.id = requested_field_id
	GROUP BY bucket, rl.project_id, f.id, f.field_path
`);

export const schemaUsageDaily = pgView("schema_usage_daily", {
	bucket: timestamp("bucket", { withTimezone: true }).notNull(),
	projectId: text("project_id").notNull(),
	schemaVersionId: text("schema_version_id").notNull(),
	requestCount: bigint("request_count", { mode: "number" }).notNull(),
}).as(sql`
	SELECT
		date_trunc('day', timestamp) AS bucket,
		project_id,
		schema_version_id,
		COUNT(*) AS request_count
	FROM request_logs
	WHERE schema_version_id IS NOT NULL
	GROUP BY bucket, project_id, schema_version_id
`);

export const recentOperations = pgView("recent_operations", {
	projectId: text("project_id").notNull(),
	operationName: varchar("operation_name", { length: 255 }),
	totalRequests: bigint("total_requests", { mode: "number" }).notNull(),
	avgLatencyMs: doublePrecision("avg_latency_ms"),
	p95LatencyMs: doublePrecision("p95_latency_ms"),
	errorRatePct: doublePrecision("error_rate_pct"),
}).as(sql`
	SELECT
		project_id,
		operation_name,
		COUNT(*) AS total_requests,
		AVG(elapsed_ms) AS avg_latency_ms,
		PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY elapsed_ms) AS p95_latency_ms,
		(SUM(CASE WHEN error_count > 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100) AS error_rate_pct
	FROM request_logs
	WHERE timestamp >= NOW() - INTERVAL '24 hours'
	GROUP BY project_id, operation_name
	ORDER BY total_requests DESC
`);

export const errorLogs = pgView("error_logs", {
	id: text("id").notNull(),
	timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
	projectId: text("project_id").notNull(),
	operationName: varchar("operation_name", { length: 255 }),
	elapsedMs: integer("elapsed_ms"),
	statusCode: integer("status_code"),
	errors: jsonb("errors"),
	ip: varchar("ip", { length: 45 }),
	userAgent: text("user_agent"),
}).as(sql`
	SELECT
		id,
		timestamp,
		project_id,
		operation_name,
		elapsed_ms,
		status_code,
		errors,
		ip,
		user_agent
	FROM request_logs
	WHERE error_count > 0
	ORDER BY timestamp DESC
`);
