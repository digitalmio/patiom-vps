import { createDb, type Db, validateToken } from "@patiom/db";
import type { LogMessage, SchemaMessage } from "@patiom/shared";
import { type Context, Hono, type Next } from "hono";

export type Env = {
	DATABASE_URL: string;
	SCHEMA_QUEUE: Queue<SchemaMessage>;
	LOGS_QUEUE: Queue<LogMessage>;
};

const app = new Hono<{ Bindings: Env; Variables: { db: Db } }>();

// workerd cannot reuse a postgres.js client across request contexts
// ("Cannot perform I/O on behalf of a different request") — create a fresh
// connection per request and close it once the handler has finished.
app.use("/api/ingest/*", dbMiddleware);
app.use("/log", dbMiddleware);
app.use("/schema", dbMiddleware);

async function dbMiddleware(c: Context, next: Next) {
	const db = createDb(c.env.DATABASE_URL);
	c.set("db", db);
	try {
		await next();
	} finally {
		await db.$client.end().catch(() => {});
	}
}

async function authorize(c: Context, headerName: string) {
	const token = c.req.header(headerName);
	if (!token) return null;
	const { isValidToken, projectData } = await validateToken(c.get("db"), token);
	if (!isValidToken || !projectData) return null;
	return projectData;
}

async function readJsonBody(c: Context) {
	try {
		return ((await c.req.json()) as Record<string, unknown>) ?? {};
	} catch {
		return null;
	}
}

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
	const { isValidToken, projectData } = await validateToken(c.get("db"), token);
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

// Drop-in compatibility with the Stellate metrics plugins (wire-compatible
// payload, 204/400/401 contract). Auth header carries the Patiom ingestion token.
app.post("/log", async (c) => {
	const projectData = await authorize(c, "Stellate-Logging-Token");
	if (!projectData) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const body = await readJsonBody(c);
	if (!body) {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (
		body.variableHash === undefined &&
		typeof body.variablesHash === "number"
	) {
		body.variableHash = body.variablesHash;
	}
	delete body.variablesHash;

	const message = {
		...body,
		projectId: projectData.id,
		timestamp: new Date().toISOString(),
	} as LogMessage;

	await c.env.LOGS_QUEUE.send(message);

	return c.body(null, 204);
});

app.post("/schema", async (c) => {
	const projectData = await authorize(c, "Stellate-Schema-Token");
	if (!projectData) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const body = await readJsonBody(c);
	if (!body || !body.schema) {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const message = {
		...body,
		projectId: projectData.id,
		timestamp: new Date().toISOString(),
	} as SchemaMessage;

	await c.env.SCHEMA_QUEUE.send(message);

	return c.body(null, 204);
});

export default {
	fetch: app.fetch,
};
