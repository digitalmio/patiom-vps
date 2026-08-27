import {
	type Granularity,
	getDashboard,
	getErrorLogs,
	getFieldUsage,
	getOperationStats,
	getRecentOperations,
	getRequestLogs,
} from "@patiom/db";
import { GraphQLError, GraphQLScalarType, Kind } from "graphql";
import type { ApiContext } from "./context";

const DateTime = new GraphQLScalarType({
	name: "DateTime",
	serialize(value) {
		return value instanceof Date ? value.toISOString() : value;
	},
	parseValue(value) {
		return typeof value === "string" ? new Date(value) : value;
	},
	parseLiteral(ast) {
		return ast.kind === Kind.STRING ? new Date(ast.value) : null;
	},
});

const JSONScalar = new GraphQLScalarType({
	name: "JSON",
	serialize: (value) => value,
	parseValue: (value) => value,
	parseLiteral: (ast) => ast,
});

function requireProject(ctx: ApiContext) {
	if (!ctx.project) {
		throw new GraphQLError("Unauthorized", {
			extensions: { code: "UNAUTHORIZED" },
		});
	}
	return ctx.project;
}

function range(args: { from?: string; to?: string }) {
	return {
		from: args.from ? new Date(args.from) : undefined,
		to: args.to ? new Date(args.to) : undefined,
	};
}

function withErrorRate(
	rows: Array<{ totalRequests: number; errorCount: number | null }>,
) {
	return rows.map((row) => ({
		...row,
		errorRatePct:
			row.totalRequests > 0
				? ((row.errorCount ?? 0) / row.totalRequests) * 100
				: null,
	}));
}

export const resolvers = {
	DateTime,
	JSON: JSONScalar,
	Query: {
		project(_parent: unknown, _args: unknown, ctx: ApiContext) {
			return requireProject(ctx);
		},
		operations(
			_parent: unknown,
			args: { granularity: Granularity; from?: string; to?: string },
			ctx: ApiContext,
		) {
			const project = requireProject(ctx);
			return getOperationStats(
				ctx.db,
				project.id,
				args.granularity,
				range(args),
			).then(withErrorRate);
		},
		recentOperations(
			_parent: unknown,
			args: { limit?: number },
			ctx: ApiContext,
		) {
			const project = requireProject(ctx);
			return getRecentOperations(ctx.db, project.id, args.limit);
		},
		fields(
			_parent: unknown,
			args: { from?: string; to?: string; limit?: number },
			ctx: ApiContext,
		) {
			const project = requireProject(ctx);
			return getFieldUsage(ctx.db, project.id, {
				...range(args),
				limit: args.limit,
			});
		},
		errors(
			_parent: unknown,
			args: {
				operationName?: string;
				from?: string;
				to?: string;
				limit?: number;
				offset?: number;
			},
			ctx: ApiContext,
		) {
			const project = requireProject(ctx);
			return getErrorLogs(ctx.db, project.id, {
				...range(args),
				operationName: args.operationName,
				limit: args.limit,
				offset: args.offset,
			});
		},
		requests(
			_parent: unknown,
			args: {
				operationName?: string;
				statusCode?: number;
				from?: string;
				to?: string;
				limit?: number;
				offset?: number;
			},
			ctx: ApiContext,
		) {
			const project = requireProject(ctx);
			return getRequestLogs(ctx.db, project.id, {
				...range(args),
				operationName: args.operationName,
				statusCode: args.statusCode,
				limit: args.limit,
				offset: args.offset,
			});
		},
		dashboard(
			_parent: unknown,
			args: { from?: string; to?: string },
			ctx: ApiContext,
		) {
			const project = requireProject(ctx);
			return getDashboard(ctx.db, project.id, range(args));
		},
	},
};
