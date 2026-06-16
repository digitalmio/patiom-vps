import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { authMiddleware } from "./middleware/auth";
import { deployRoute } from "./routes/deploy";
import { healthRoute } from "./routes/health";
import { envRoute } from "./routes/env";
import { dbRoute } from "./routes/db";
import { appsRoute } from "./routes/apps";

const app = new Hono();

app.use("/health", healthRoute);
app.use("*", authMiddleware);

app.route("/deploy", deployRoute);
app.route("/env", envRoute);
app.route("/db", dbRoute);
app.route("/apps", appsRoute);

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT),
});
