import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { APPS_DIR } from "../config";
import { requireScope } from "../middleware/scope";
import { validateAppName } from "../core/validation";
import { getCurrentRelease } from "../core/releases";
import { listAllInstances, stop, start } from "../core/systemd";
import { getServiceState, getServiceLogs, getServiceLogsJson } from "../core/diagnostics";

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

    const appNames = entriesWithStats
      .filter(({ isDirectory }) => isDirectory)
      .map(({ name }) => name);

    const apps = await Promise.all(
      appNames.map(async (name) => {
        const currentRelease = await getCurrentRelease(name);
        const ports = await listAllInstances(name);
        const instanceStates = await Promise.all(
          ports.map(async (port) => {
            const state = await getServiceState(`${name}@${port}`);
            return { port: Number(port), state };
          })
        );

        let lastDeployStatus: string | null = null;
        if (currentRelease) {
          lastDeployStatus = await fs
            .readFile(path.join(currentRelease.path, "status"), "utf-8")
            .then((s) => s.trim())
            .catch(() => null);
        }

        const allActive = instanceStates.length > 0 && instanceStates.every((i) => i.state === "active");

        return {
          name,
          currentRelease: currentRelease?.id ?? null,
          lastDeployStatus,
          instanceStates,
          instanceCount: instanceStates.length,
          allActive,
        };
      })
    );

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

appsRoute.get("/:name/logs", async (c) => {
  const name = c.req.param("name");
  const lines = Math.max(1, Math.min(parseInt(c.req.query("lines") || "50", 10), 1000));
  const portFilter = c.req.query("port");
  let cursors: Record<string, string> = {};
  try {
    const raw = c.req.query("cursors");
    if (raw) cursors = JSON.parse(raw);
  } catch {
    // malformed cursors, ignore
  }

  try {
    validateAppName(name);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid input" }, 400);
  }

  const ports = await listAllInstances(name);
  const targetPorts = portFilter
    ? ports.filter((p) => p === portFilter)
    : ports;

  if (targetPorts.length === 0) {
    return c.json({ lines: [], cursors: {} });
  }

  const perInstance = await Promise.all(
    targetPorts.map(async (port) => {
      const cursor = cursors[port];
      const entries = await getServiceLogsJson(`${name}@${port}`, cursor ? 100 : lines, cursor);
      return { port, entries };
    })
  );

  const allLines = perInstance
    .flatMap(({ port, entries }) =>
      entries.map((e) => ({ ts: e.ts, port: Number(port), message: e.message }))
    )
    .toSorted((a, b) => a.ts.localeCompare(b.ts));

  const newCursors = Object.fromEntries(
    perInstance.map(({ port, entries }) => {
      const cursor = entries.length > 0 ? entries.at(-1)!.cursor : cursors[port];
      return cursor ? [port, cursor] : null;
    }).filter(Boolean)
  );

  return c.json({ lines: allLines, cursors: newCursors });
});
