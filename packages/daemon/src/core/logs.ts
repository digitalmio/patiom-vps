import fs from "node:fs/promises";
import path from "node:path";
import { getReleasesDir } from "./releases";

export const getLogPath = (appName: string, releaseId: string): string => {
  return path.join(getReleasesDir(appName), releaseId, "deploy.log");
};

export const writeLog = async (
  appName: string,
  releaseId: string,
  msg: string
): Promise<void> => {
  const logPath = getLogPath(appName, releaseId);
  await fs.appendFile(logPath, `${msg}\n`);
};

export const readLog = async (
  appName: string,
  releaseId: string,
  offset: number = 0
): Promise<{ lines: string[]; nextOffset: number; done: boolean }> => {
  const logPath = getLogPath(appName, releaseId);

  try {
    const content = await fs.readFile(logPath, "utf-8");
    const allLines = content.split("\n").filter((line) => line.length > 0);
    const lines = allLines.slice(offset);

    return {
      lines,
      nextOffset: offset + lines.length,
      done: false,
    };
  } catch {
    return { lines: [], nextOffset: offset, done: false };
  }
};
