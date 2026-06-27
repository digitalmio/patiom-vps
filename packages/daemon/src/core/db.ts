import fs from "node:fs/promises";
import path from "node:path";
import { getSharedDir } from "./releases";

export type Logger = (msg: string) => void;

export type DbInfo = {
  name: string;
  sizeBytes: number;
};

const getDirSize = async (dirPath: string): Promise<number> => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return getDirSize(entryPath);
        }
        const stat = await fs.stat(entryPath);
        return stat.size;
      })
    );
    return sizes.reduce((acc, s) => acc + s, 0);
  } catch {
    return 0;
  }
};

export const listDbs = async (appName: string): Promise<DbInfo[]> => {
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

    const dbNames = entriesWithStats
      .filter(({ isDirectory }) => isDirectory)
      .map(({ entry }) => entry);

    const dbs = await Promise.all(
      dbNames.map(async (name) => {
        const dbPath = path.join(sharedDir, name);
        const sizeBytes = await getDirSize(dbPath);
        return { name, sizeBytes };
      })
    );

    return dbs;
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
