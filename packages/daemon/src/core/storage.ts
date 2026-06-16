import fs from "node:fs/promises";
import path from "node:path";
import { getSharedDir } from "./releases";

export type Logger = (msg: string) => void;

export const getStorageDir = (appName: string, storageFolder: string): string => {
  return path.join(getSharedDir(appName), storageFolder);
};

export const ensureStorageDir = async (
  appName: string,
  storageFolder: string,
  log: Logger
): Promise<void> => {
  const storageDir = getStorageDir(appName, storageFolder);

  log(`Ensuring storage directory exists: ${storageDir}`);
  await fs.mkdir(storageDir, { recursive: true });
  log("Storage directory ready");
};
