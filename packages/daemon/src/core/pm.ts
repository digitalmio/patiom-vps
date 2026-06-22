import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { CACHE_DIR } from "../config";

export type Logger = (msg: string) => void;

const hasPackageLock = async (releaseDir: string): Promise<boolean> => {
  try {
    await fs.access(path.join(releaseDir, "package-lock.json"));
    return true;
  } catch {
    return false;
  }
};

const NPM_FLAGS = ["--no-audit", "--no-fund", "--prefer-offline", "--cache", CACHE_DIR];

export const install = async (releaseDir: string, log: Logger): Promise<void> => {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const lockfile = await hasPackageLock(releaseDir);
  const args = lockfile
    ? ["ci", "--omit=dev", ...NPM_FLAGS]
    : ["install", "--omit=dev", ...NPM_FLAGS];

  log(`Running: npm ${args.join(" ")}`);

  const proc = execa("npm", args, {
    cwd: releaseDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.stdout?.on("data", (data) => log(data.toString().trim()));
  proc.stderr?.on("data", (data) => log(data.toString().trim()));

  await proc;
  log("Dependencies installed successfully");
};
