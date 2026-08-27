// Query helpers for the analytics data-access API
import { and, asc, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
	errorLogs,
	fields,
	fieldUsageStatsDaily,
	fieldVersionPresence,
	operationStatsDaily,
	operationStatsHourly,
	recentOperations,
	requestLogs,
	schemaUsageDaily,
} from "../schema";

export type Granularity = "hour" | "day";

export type RangeFilter = {
	from?: Date;
	to?: Date;
};

export async function getOperationStats(
	db: Db,
	projectId: string,
	granularity: Granularity,
	range: RangeFilter = {},
) {
	const view =
		granularity === "hour" ? operationStatsHourly : operationStatsDaily;
	const conditions = [eq(view.projectId, projectId)];
	if (range.from) conditions.push(gte(view.bucket, range.from));
	if (range.to) conditions.push(lte(view.bucket, range.to));

	return db
		.select()
		.from(view)
		.where(and(...conditions))
		.orderBy(asc(view.bucket));
}

export async function getRecentOperations(
	db: Db,
	projectId: string,
	limit = 20,
) {
	return db
		.select()
		.from(recentOperations)
		.where(eq(recentOperations.projectId, projectId))
		.orderBy(desc(recentOperations.totalRequests))
		.limit(limit);
}

export async function getFieldUsage(
	db: Db,
	projectId: string,
	range: RangeFilter & { limit?: number } = {},
) {
	const conditions = [eq(fieldUsageStatsDaily.projectId, projectId)];
	if (range.from) conditions.push(gte(fieldUsageStatsDaily.bucket, range.from));
	if (range.to) conditions.push(lte(fieldUsageStatsDaily.bucket, range.to));

	return db
		.select({
			fieldId: fieldUsageStatsDaily.fieldId,
			fieldPath: fieldUsageStatsDaily.fieldPath,
			usageCount: fieldUsageStatsDaily.usageCount,
			bucket: fieldUsageStatsDaily.bucket,
			parentType: fields.parentType,
		})
		.from(fieldUsageStatsDaily)
		.innerJoin(fields, eq(fields.id, fieldUsageStatsDaily.fieldId))
		.where(and(...conditions))
		.orderBy(desc(fieldUsageStatsDaily.usageCount))
		.limit(range.limit ?? 25);
}

/**
 * Request share per schema version — answers "in the last N hours, X% of
 * calls used schema A".
 */
export async function getSchemaUsage(
	db: Db,
	projectId: string,
	range: RangeFilter = {},
) {
	const conditions = [eq(schemaUsageDaily.projectId, projectId)];
	if (range.from) conditions.push(gte(schemaUsageDaily.bucket, range.from));
	if (range.to) conditions.push(lte(schemaUsageDaily.bucket, range.to));

	const rows = await db
		.select({
			schemaVersionId: schemaUsageDaily.schemaVersionId,
			requestCount: schemaUsageDaily.requestCount,
		})
		.from(schemaUsageDaily)
		.where(and(...conditions));

	const total = rows.reduce((sum, row) => sum + row.requestCount, 0);
	return rows
		.map((row) => ({
			schemaVersionId: row.schemaVersionId,
			requestCount: row.requestCount,
			requestSharePct: total > 0 ? (row.requestCount / total) * 100 : null,
		}))
		.sort((a, b) => b.requestCount - a.requestCount);
}

/**
 * For every canonical field: which schema versions contained it and when it
 * was first/last seen. Pass `fieldPath` to scope to a single field.
 */
export async function getFieldVersionHistory(
	db: Db,
	projectId: string,
	filter: { fieldPath?: string } = {},
) {
	const conditions = [eq(fieldVersionPresence.projectId, projectId)];
	if (filter.fieldPath) {
		conditions.push(eq(fieldVersionPresence.fieldPath, filter.fieldPath));
	}

	return db
		.select()
		.from(fieldVersionPresence)
		.where(and(...conditions))
		.orderBy(desc(fieldVersionPresence.lastSeenAt));
}

export type ErrorLogFilter = RangeFilter & {
	operationName?: string;
	limit?: number;
	offset?: number;
};

export async function getErrorLogs(
	db: Db,
	projectId: string,
	filter: ErrorLogFilter = {},
) {
	const conditions = [eq(errorLogs.projectId, projectId)];
	if (filter.operationName)
		conditions.push(eq(errorLogs.operationName, filter.operationName));
	if (filter.from) conditions.push(gte(errorLogs.timestamp, filter.from));
	if (filter.to) conditions.push(lte(errorLogs.timestamp, filter.to));

	return db
		.select()
		.from(errorLogs)
		.where(and(...conditions))
		.orderBy(desc(errorLogs.timestamp))
		.limit(filter.limit ?? 50)
		.offset(filter.offset ?? 0);
}

export type RequestLogFilter = RangeFilter & {
	operationName?: string;
	statusCode?: number;
	limit?: number;
	offset?: number;
};

export async function getRequestLogs(
	db: Db,
	projectId: string,
	filter: RequestLogFilter = {},
) {
	const conditions = [eq(requestLogs.projectId, projectId)];
	if (filter.operationName)
		conditions.push(eq(requestLogs.operationName, filter.operationName));
	if (filter.statusCode != null)
		conditions.push(eq(requestLogs.statusCode, filter.statusCode));
	if (filter.from) conditions.push(gte(requestLogs.timestamp, filter.from));
	if (filter.to) conditions.push(lte(requestLogs.timestamp, filter.to));

	return db
		.select()
		.from(requestLogs)
		.where(and(...conditions))
		.orderBy(desc(requestLogs.timestamp))
		.limit(filter.limit ?? 50)
		.offset(filter.offset ?? 0);
}

export async function getDashboard(
	db: Db,
	projectId: string,
	range: RangeFilter = {},
) {
	const conditions = [eq(requestLogs.projectId, projectId)];
	if (range.from) conditions.push(gte(requestLogs.timestamp, range.from));
	if (range.to) conditions.push(lte(requestLogs.timestamp, range.to));

	const [totals, recentOperationsList, topFields, hourly] = await Promise.all([
		db
			.select({
				totalRequests: count(),
				errorCount: sql<number>`COALESCE(SUM(${requestLogs.errorCount}), 0)`,
				avgLatencyMs: sql<number>`AVG(${requestLogs.elapsedMs})`,
				p95LatencyMs: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${requestLogs.elapsedMs})`,
			})
			.from(requestLogs)
			.where(and(...conditions)),
		getRecentOperations(db, projectId, 10),
		getFieldUsage(db, projectId, { ...range, limit: 10 }),
		getOperationStats(db, projectId, "hour", range),
	]);

	const row = totals[0] ?? {
		totalRequests: 0,
		errorCount: 0,
		avgLatencyMs: null,
		p95LatencyMs: null,
	};

	return {
		totalRequests: row.totalRequests,
		errorCount: row.errorCount,
		errorRatePct:
			row.totalRequests > 0 ? (row.errorCount / row.totalRequests) * 100 : null,
		avgLatencyMs: row.avgLatencyMs,
		p95LatencyMs: row.p95LatencyMs,
		recentOperations: recentOperationsList,
		topFields,
		hourly,
	};
}
