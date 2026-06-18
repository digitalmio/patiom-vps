import { Hono } from "hono";
import { setEnv, deleteEnv } from "../core/env";
import { requireScope } from "../middleware/scope";

export const envRoute = new Hono();

const log = (msg: string) => console.log(msg);

envRoute.post("/", requireScope("rw"), async (c) => {
  const body = await c.req.json();
  const { appName, key, value } = body;

  if (!appName || !key || value === undefined) {
    return c.json({ error: "Missing required fields: appName, key, value" }, 400);
  }

  await setEnv(appName, key, value, log);

  return c.json({ success: true, key });
});

envRoute.delete("/:key", requireScope("rw"), async (c) => {
  const appName = c.req.query("appName");
  const key = c.req.param("key");

  if (!appName || !key) {
    return c.json({ error: "Missing required fields: appName, key" }, 400);
  }

  await deleteEnv(appName, key, log);

  return c.json({ success: true, key });
});
