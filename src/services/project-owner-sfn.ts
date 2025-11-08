import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db, eq, schema } from "@/lib/db";
import { isAuthenticatedMiddleware } from "./auth-middleware";

export const isProjectOwner = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(z.object({ userId: z.string(), projectId: z.string() }))
	.handler(async ({ context, data }) => {
		const project = await db
			.select({ userId: schema.projects.userId })
			.from(schema.projects)
			.where(eq(schema.projects.id, data.projectId))
			.limit(1);

		if (!project.length) {
			throw new Error("Project not found");
		}

		if (project[0].userId !== context.user.id) {
			throw new Error("You do not have permission to access this project");
		}
	});
