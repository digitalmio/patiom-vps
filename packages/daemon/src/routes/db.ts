import { Hono } from "hono";
import { listDbs, addDb, removeDb } from "../core/db";
import { requireScope } from "../middleware/scope";
import { validateAppName, validateDbName } from "../core/validation";

export const dbRoute = new Hono();

const log = (msg: string) => console.log(msg);

dbRoute.get("/", async (c) => {
  const appName = c.req.query("appName");

  if (!appName) {
    return c.json({ error: "Missing required field: appName" }, 400);
  }

  try {
    validateAppName(appName);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid input" }, 400);
  }

  const dbs = await listDbs(appName);
  return c.json(dbs);
});

dbRoute.post("/", requireScope("rw"), async (c) => {
  const body = await c.req.json();
  const { appName, name } = body;

  if (!appName || !name) {
    return c.json({ error: "Missing required fields: appName, name" }, 400);
  }

  try {
    validateAppName(appName);
    validateDbName(name);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid input" }, 400);
  }

  await addDb(appName, name, log);

  return c.json({ success: true, name });
});

dbRoute.delete("/:name", requireScope("rw"), async (c) => {
  const appName = c.req.query("appName");
  const name = c.req.param("name");

  if (!appName || !name) {
    return c.json({ error: "Missing required fields: appName, name" }, 400);
  }

  try {
    validateAppName(appName);
    validateDbName(name);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid input" }, 400);
  }

  await removeDb(appName, name, log);

  return c.json({ success: true, name });
});
