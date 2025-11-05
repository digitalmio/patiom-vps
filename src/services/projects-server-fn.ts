import { createServerFn } from "@tanstack/react-start";
import { db, eq, schema } from "@/lib/db";
import { authMiddleware } from "./auth-middleware";

export const getUserProjects = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { user } = context;
		if (!user?.id) {
			return [];
		}

		const projects = await db
			.select()
			.from(schema.projects)
			.where(eq(schema.projects.userId, user.id))
			.orderBy(schema.projects.name);

		return projects;
	});
