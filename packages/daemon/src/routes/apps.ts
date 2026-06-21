import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { APPS_DIR } from "../config";
import { requireScope } from "../middleware/scope";
import { validateAppName } from "../core/validation";
import { getCurrentRelease } from "../core/releases";
import { listAllInstances, stop, start } from "../core/systemd";
import { getServiceState, getServiceLogs } from "../core/diagnostics";

export const appsRoute = new Hono();

appsRoute.get("/", async (c) => {
  try {
    const entries = await fs.readdir(APPS_DIR);
    const entriesWithStats = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = `${APPS_DIR}/${entry}`;
        const stat = await fs.stat(entryPath);
        return { name: entry, isDirectory: stat.isDirectory() };
      })
    );

    const apps = entriesWithStats
      .filter(({ isDirectory }) => isDirectory)
      .map(({ name }) => name);

    return c.json(apps);
  } catch {
    return c.json([]);
  }
});

appsRoute.get("/:name/status", async (c) => {
  const name = c.req.param("name");
  const lines = Math.min(parseInt(c.req.query("lines") || "20", 10), 100);

  try {
    validateAppName(name);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid input" }, 400);
  }

  const currentRelease = await getCurrentRelease(name);
  const ports = await listAllInstances(name);
  const lastDeployStatus = currentRelease
    ? await fs.readFile(path.join(currentRelease.path, "status"), "utf-8").catch(() => null)
    : null;

  const instances = await Promise.all(
    ports.map(async (port) => {
      const state = await getServiceState(`${name}@${port}`);
      const logs = await getServiceLogs(`${name}@${port}`, lines);
      return { port: Number(port), state, logs };
    })
  );

  return c.json({
    name,
    currentRelease: currentRelease?.id ?? null,
    lastDeploy: lastDeployStatus ? { releaseId: currentRelease.id, status: lastDeployStatus.trim() } : null,
    instances,
  });
});

appsRoute.post("/:name/restart", requireScope("rw"), async (c) => {
  const name = c.req.param("name");

  try {
    validateAppName(name);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid input" }, 400);
  }

  const ports = await listAllInstances(name);
  if (ports.length === 0) {
    return c.json({ error: "No instances found for this app" }, 404);
  }

  await Promise.all(ports.map((port) => stop(`${name}@${port}`)));
  await Promise.all(ports.map((port) => start(`${name}@${port}`)));

  return c.json({ success: true, restarted: ports.map(Number) });
});
