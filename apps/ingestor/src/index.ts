import { createDb, type Db, validateToken } from "@patiom/db";
import type { LogMessage, SchemaMessage } from "@patiom/shared";
import { Hono } from "hono";

export type Env = {
	DATABASE_URL: string;
	SCHEMA_QUEUE: Queue<SchemaMessage>;
	LOGS_QUEUE: Queue<LogMessage>;
};

// Reuse the DB connection within an isolate
let db: Db | null = null;
function getDb(url: string): Db {
	db ??= createDb(url);
	return db;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("Hello from Patiom!"));

app.post("/api/ingest/:type", async (c) => {
	const type = c.req.param("type");

	// allow only "log" or "schema" types
	if (type !== "log" && type !== "schema") {
		return c.json({ error: "Invalid type" }, 400);
	}

	// check if token is provided...
	const token = c.req.header("Patiom-Token");
	if (!token) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	// ...and if it's valid
	const { isValidToken, projectData } = await validateToken(
		getDb(c.env.DATABASE_URL),
		token,
	);
	if (!isValidToken || !projectData) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	// all ok, now send the payload to the right queue
	const body = (await c.req.json()) as Record<string, unknown>;
	const message = {
		...body,
		projectId: projectData.id,
		timestamp: new Date().toISOString(),
	};

	if (type === "schema") {
		await c.env.SCHEMA_QUEUE.send(message as SchemaMessage);
	} else {
		await c.env.LOGS_QUEUE.send(message as LogMessage);
	}

	// and respond with success
	return c.json({
		status: `${type.charAt(0).toUpperCase() + type.slice(1)} successfully received`,
	});
});

export default {
	fetch: app.fetch,
};
