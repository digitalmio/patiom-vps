import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { deployRoute } from "./routes/deploy";

const app = new Hono();

app.route("/deploy", deployRoute);

serve({
	fetch: app.fetch,
	port: Number(process.env.PORT),
});
