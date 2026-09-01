import {
	getClients,
	getDashboard,
	getErrorLogs,
	getFieldUsage,
	getFieldVersionHistory,
	getLocations,
	getOperationCardinality,
	getOperationStats,
	getRecentOperations,
	getRequestLogs,
	getSchemaUsage,
} from "@patiom/db";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, eq, schema } from "@/lib/db";
import { isAuthenticatedMiddleware } from "./auth-middleware";

async function assertProjectAccess(projectId: string, userId: string) {
	const rows = await getDb()
		.select({ userId: schema.projects.userId })
		.from(schema.projects)
		.where(eq(schema.projects.id, projectId))
		.limit(1);

	if (!rows.length) {
		throw new Error("Project not found");
	}
	if (rows[0].userId !== userId) {
		throw new Error("You do not have permission to access this project");
	}
}

const projectIdWithRange = z.object({
	projectId: z.string(),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
});

export const projectOperations = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(
		z.object({
			projectId: z.string(),
			granularity: z.enum(["minute", "hour", "day"]).default("day"),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		await assertProjectAccess(data.projectId, context.user.id);
		return getOperationStats(getDb(), data.projectId, data.granularity, {
			from: data.from,
			to: data.to,
		});
	});

export const projectRecentOperations = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(
		z.object({
			projectId: z.string(),
			limit: z.number().int().min(1).max(100).optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		await assertProjectAccess(data.projectId, context.user.id);
		return getRecentOperations(getDb(), data.projectId, data.limit ?? 20);
	});

export const projectFieldUsage = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(
		z.object({
			projectId: z.string(),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
			limit: z.number().int().optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		await assertProjectAccess(data.projectId, context.user.id);
		return getFieldUsage(getDb(), data.projectId, {
			from: data.from,
			to: data.to,
			limit: data.limit,
		});
	});

export const projectSchemaUsage = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(projectIdWithRange)
	.handler(async ({ context, data }) => {
		await assertProjectAccess(data.projectId, context.user.id);
		return getSchemaUsage(getDb(), data.projectId, { from: data.from, to: data.to });
	});

export const projectFieldVersionHistory = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(
		z.object({ projectId: z.string(), fieldPath: z.string().optional() }),
	)
	.handler(async ({ context, data }) => {
		await assertProjectAccess(data.projectId, context.user.id);
		return getFieldVersionHistory(getDb(), data.projectId, {
			fieldPath: data.fieldPath,
		});
	});

export const projectErrorLogs = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(
		z.object({
			projectId: z.string(),
			operationName: z.string().optional(),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
			limit: z.number().int().optional(),
			offset: z.number().int().optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		await assertProjectAccess(data.projectId, context.user.id);
		const rows = await getErrorLogs(getDb(), data.projectId, {
			operationName: data.operationName,
			from: data.from,
			to: data.to,
			limit: data.limit,
			offset: data.offset,
		});
		// TanStack Start's serializer models raw jsonb as `{ [x: string]: {} }`.
		return rows.map((row) => ({
			...row,
			// biome-ignore lint/complexity/noBannedTypes: matches TanStack Start's serializer type for raw jsonb
			errors: (row.errors ?? null) as { [x: string]: {} } | null,
		}));
	});

export const projectRequestLogs = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(
		z.object({
			projectId: z.string(),
			operationName: z.string().optional(),
			statusCode: z.number().int().optional(),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
			limit: z.number().int().optional(),
			offset: z.number().int().optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		await assertProjectAccess(data.projectId, context.user.id);
		const rows = await getRequestLogs(getDb(), data.projectId, {
			operationName: data.operationName,
			statusCode: data.statusCode,
			from: data.from,
			to: data.to,
			limit: data.limit,
			offset: data.offset,
		});
		// TanStack Start's serializer models raw jsonb as `{ [x: string]: {} }`;
		// align the inferred `unknown` with that shape.
		return rows.map((row) => ({
			...row,
			// biome-ignore lint/complexity/noBannedTypes: matches TanStack Start's serializer type for raw jsonb
			errors: (row.errors ?? null) as { [x: string]: {} } | null,
		}));
	});

export const projectDashboard = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(projectIdWithRange)
	.handler(async ({ context, data }) => {
		await assertProjectAccess(data.projectId, context.user.id);
		return getDashboard(getDb(), data.projectId, { from: data.from, to: data.to });
	});

export const projectClients = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(
		z.object({
			projectId: z.string(),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
			limit: z.number().int().min(1).max(200).optional(),
			offset: z.number().int().min(0).optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		await assertProjectAccess(data.projectId, context.user.id);
		return getClients(
			getDb(),
			data.projectId,
			{ from: data.from, to: data.to },
			{
				limit: data.limit,
				offset: data.offset,
			},
		);
	});

export const projectLocations = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(
		z.object({
			projectId: z.string(),
			groupBy: z.enum(["country", "city"]).default("country"),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
			limit: z.number().int().min(1).max(200).optional(),
			offset: z.number().int().min(0).optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		await assertProjectAccess(data.projectId, context.user.id);
		return getLocations(
			getDb(),
			data.projectId,
			{ from: data.from, to: data.to },
			{
				groupBy: data.groupBy,
				limit: data.limit,
				offset: data.offset,
			},
		);
	});

export const projectOperationCardinality = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(
		z.object({
			projectId: z.string(),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
			limit: z.number().int().min(1).max(50).optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		await assertProjectAccess(data.projectId, context.user.id);
		return getOperationCardinality(
			getDb(),
			data.projectId,
			{ from: data.from, to: data.to },
			{ limit: data.limit },
		);
	});
