import { db, eq, schema } from "@/lib/db";

export const validateToken = async (token: string) => {
	const projectData = await db.query.projects.findFirst({
		where: eq(schema.projects.ingestionToken, token),
	});

	return {
		projectData,
		isValidToken: Boolean(projectData),
	};
};
