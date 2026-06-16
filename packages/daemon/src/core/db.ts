import fs from "node:fs/promises";
import path from "node:path";
import { getSharedDir } from "./releases";

export type Logger = (msg: string) => void;

export const listDbs = async (appName: string): Promise<string[]> => {
  const sharedDir = getSharedDir(appName);

  try {
    const entries = await fs.readdir(sharedDir);
    const entriesWithStats = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(sharedDir, entry);
        const stat = await fs.stat(entryPath);
        return { entry, isDirectory: stat.isDirectory() };
      })
    );

    return entriesWithStats
      .filter(({ isDirectory }) => isDirectory)
      .map(({ entry }) => entry);
  } catch {
    return [];
  }
};

export const addDb = async (
  appName: string,
  name: string,
  log: Logger
): Promise<void> => {
  const sharedDir = getSharedDir(appName);
  const dbDir = path.join(sharedDir, name);

  log(`Creating database folder: ${dbDir}`);
  await fs.mkdir(dbDir, { recursive: true });
  log(`Database ${name} created`);
};

export const removeDb = async (
  appName: string,
  name: string,
  log: Logger
): Promise<void> => {
  const sharedDir = getSharedDir(appName);
  const dbDir = path.join(sharedDir, name);

  log(`Removing database folder: ${dbDir}`);
  await fs.rm(dbDir, { recursive: true, force: true });
  log(`Database ${name} removed`);
};
