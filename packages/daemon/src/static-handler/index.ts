import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

const app = new Hono();

// Serve files straight out of the deployment directory
app.use("/*", serveStatic({ root: process.env.PUBLIC_DIR }));

serve({
	fetch: app.fetch,
	port: Number(process.env.PORT),
});
