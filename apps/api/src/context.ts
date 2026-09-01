import type { PatiomAuth } from "@patiom/auth";
import { and, type Db, eq, schema } from "@patiom/db";
import type { YogaInitialContext } from "graphql-yoga";

export type ApiEnv = {
	HYPERDRIVE: Hyperdrive;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
};

export type ApiContext = {
	db: Db;
	project: typeof schema.projects.$inferSelect | null;
	[key: string]: unknown;
};

export type ApiServerContext = ApiEnv & {
	db: Db;
	auth: PatiomAuth;
};

export async function createContext(
	initialContext: YogaInitialContext & { db?: Db; auth?: PatiomAuth },
): Promise<ApiContext> {
	const db = initialContext.db;
	const auth = initialContext.auth;
	if (!db || !auth) {
		throw new Error("Patiom API server context is missing db/auth bindings");
	}
	const { request } = initialContext;

	const header = request.headers.get("authorization");
	if (!header?.startsWith("Bearer ")) return { db, project: null };

	const key = header.slice("Bearer ".length).trim();
	if (!key) return { db, project: null };

	const result = await auth.api.verifyApiKey({ body: { key } });
	if (!result.valid || !result.key) return { db, project: null };

	const projectId = (result.key.metadata as { projectId?: string } | null)
		?.projectId;
	if (!projectId) return { db, project: null };

	const project = await db.query.projects.findFirst({
		where: and(
			eq(schema.projects.id, projectId),
			eq(schema.projects.userId, result.key.userId),
		),
	});

	return { db, project: project ?? null };
}
