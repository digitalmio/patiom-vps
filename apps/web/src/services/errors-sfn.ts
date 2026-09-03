import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, desc, eq, getDb, gt, schema } from "@/lib/db";
import { isAuthenticatedMiddleware } from "./auth-middleware";

export const getProjectErrors = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(z.object({ projectId: z.string() }))
	.handler(async ({ data }) => {
		// Note: Project ownership is verified at the route level in beforeLoad
		// So we don't need to check it again here
		const errors = await getDb()
			.select()
			.from(schema.requestLogs)
			.where(
				and(
					eq(schema.requestLogs.projectId, data.projectId),
					gt(schema.requestLogs.errorCount, 0),
				),
			)
			.orderBy(desc(schema.requestLogs.timestamp))
			.limit(100);

		return errors;
	});
