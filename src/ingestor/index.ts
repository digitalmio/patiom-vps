import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { validateToken } from "@/lib/auth/queries";
import { logsQueue, schemaQueue } from "@/lib/redis";

const app = new Hono();

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
	const { isValidToken, projectData } = await validateToken(token);
	if (!isValidToken || !projectData) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	// all ok, now add data to the right queue
	const queue = type === "schema" ? schemaQueue : logsQueue;
	const data = {
		...(await c.req.json()),
		projectId: projectData.id,
		timestamp: new Date(),
	};
	await queue.add(`${type}Queue`, data);

	// and respond with success
	return c.json({
		status: `${type.charAt(0).toUpperCase() + type.slice(1)} successfully received`,
	});
});

serve({ fetch: app.fetch, port: 4000 });
