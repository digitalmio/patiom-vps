import fs from "node:fs/promises";
import { Hono } from "hono";
import { APPS_DIR } from "../config";

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
