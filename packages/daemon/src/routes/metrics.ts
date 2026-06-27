import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { METRICS_SERVER_DIR, METRICS_APPS_DIR } from "../config";
import { readMetricsRange, type ServerMetric, type PerAppMetric } from "../core/metrics";
import { validateAppName } from "../core/validation";

export const metricsRoute = new Hono();

const parseTimeParams = (c: { req: { query: (key: string) => string | undefined } }): { from: Date; to: Date } => {
  const to = c.req.query("to") ? new Date(c.req.query("to")!) : new Date();
  const from = c.req.query("from") ? new Date(c.req.query("from")!) : new Date(Date.now() - 3_600_000);
  return { from, to };
};

metricsRoute.get("/server", async (c) => {
  const { from, to } = parseTimeParams(c);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return c.json({ error: "Invalid from or to date" }, 400);
  }
  const metrics = await readMetricsRange<ServerMetric>(METRICS_SERVER_DIR, from, to);
  return c.json({ metrics });
});

metricsRoute.get("/apps", async (c) => {
  const { from, to } = parseTimeParams(c);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return c.json({ error: "Invalid from or to date" }, 400);
  }

  try {
    const entries = await fs.readdir(METRICS_APPS_DIR);
    const appNames = (await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(METRICS_APPS_DIR, entry);
        const stat = await fs.stat(fullPath);
        return stat.isDirectory() ? entry : null;
      })
    )).filter((n): n is string => n !== null);

    const apps: Record<string, PerAppMetric[]> = {};
    await Promise.all(
      appNames.map(async (appName) => {
        const appDir = path.join(METRICS_APPS_DIR, appName);
        const metrics = await readMetricsRange<PerAppMetric>(appDir, from, to);
        apps[appName] = metrics;
      })
    );

    return c.json({ apps });
  } catch {
    return c.json({ apps: {} });
  }
});

metricsRoute.get("/apps/:name", async (c) => {
  const name = c.req.param("name");
  const { from, to } = parseTimeParams(c);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return c.json({ error: "Invalid from or to date" }, 400);
  }

  try {
    validateAppName(name);
    const appDir = path.join(METRICS_APPS_DIR, name);
    const metrics = await readMetricsRange<PerAppMetric>(appDir, from, to);
    return c.json({ metrics });
  } catch {
    return c.json({ metrics: [] });
  }
});
