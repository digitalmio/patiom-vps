import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { auditMiddleware } from "./middleware/audit";
import { authMiddleware } from "./middleware/auth";
import { deployRoute } from "./routes/deploy";
import { healthRoute } from "./routes/health";
import { envRoute } from "./routes/env";
import { dbRoute } from "./routes/db";
import { appsRoute } from "./routes/apps";
import { logsRoute } from "./routes/logs";
import { tokensRoute } from "./routes/tokens";

const app = new Hono();

app.route("/health", healthRoute);

app.use("*", auditMiddleware);
app.use("*", authMiddleware);

app.route("/deploy", deployRoute);
app.route("/env", envRoute);
app.route("/db", dbRoute);
app.route("/apps", appsRoute);
app.route("/logs", logsRoute);
app.route("/tokens", tokensRoute);

serve({
	fetch: app.fetch,
	port: Number(process.env.PORT),
});
