import { Hono } from "hono";
import { readLog } from "../core/logs";

export const logsRoute = new Hono();

logsRoute.get("/:name/:releaseId", async (c) => {
  const name = c.req.param("name");
  const releaseId = c.req.param("releaseId");
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const result = await readLog(name, releaseId, offset);

  return c.json(result);
});
