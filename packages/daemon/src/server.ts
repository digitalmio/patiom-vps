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
import { statusRoute } from "./routes/status";
import { systemRoute } from "./routes/system";
import { metricsRoute } from "./routes/metrics";
import { startMetricsCollection } from "./core/metrics";

const app = new Hono();

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

app.route("/health", healthRoute);

app.use("*", auditMiddleware);
app.use("*", authMiddleware);

app.route("/deploy", deployRoute);
app.route("/env", envRoute);
app.route("/db", dbRoute);
app.route("/apps", appsRoute);
app.route("/logs", logsRoute);
app.route("/tokens", tokensRoute);
app.route("/status", statusRoute);
app.route("/system", systemRoute);
app.route("/metrics", metricsRoute);

export const startServer = () => {
  startMetricsCollection().catch((err) => console.error("Metrics collection failed to start:", err));
	serve({
		fetch: app.fetch,
		port: Number(process.env.PORT) || 4000,
	});
};
