import { db, eq, schema } from "@/lib/db";

export const validateToken = async (token: string, type: "schema" | "log") => {
	const projectData = await db.query.projects.findFirst({
		where:
			type === "schema"
				? eq(schema.projects.ingestionSchemaToken, token)
				: eq(schema.projects.ingestionLogToken, token),
	});

	return {
		projectData,
		isValidToken: Boolean(projectData),
	};
};
