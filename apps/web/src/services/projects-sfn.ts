import { createServerFn } from "@tanstack/react-start";
import { getDb, eq, schema } from "@/lib/db";
import { isAuthenticatedMiddleware } from "./auth-middleware";

export const getUserProjects = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.handler(async ({ context }) => {
		const { user } = context;

		const projects = await getDb()
			.select()
			.from(schema.projects)
			.where(eq(schema.projects.userId, user.id))
			.orderBy(schema.projects.name);

		return projects;
	});
