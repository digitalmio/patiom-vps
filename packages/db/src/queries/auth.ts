import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { projects } from "../schema";

export async function validateToken(db: Db, token: string) {
	const projectData = await db.query.projects.findFirst({
		where: eq(projects.ingestionToken, token),
	});

	return {
		projectData,
		isValidToken: Boolean(projectData),
	};
}
