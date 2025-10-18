import { db, eq, schema } from ".";

export const validateToken = async (token: string, type: "schema" | "log") => {
	const data = db.query.projects.findFirst({
		where:
			type === "schema"
				? eq(schema.projects.ingestionSchemaToken, token)
				: eq(schema.projects.ingestionLogToken, token),
	});

	return {
		data,
		isValidToken: Boolean(data),
	};
};
