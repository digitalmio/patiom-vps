import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";

export type Logger = (msg: string) => void;

const hasPackageLock = async (releaseDir: string): Promise<boolean> => {
  try {
    await fs.access(path.join(releaseDir, "package-lock.json"));
    return true;
  } catch {
    return false;
  }
};

export const install = async (releaseDir: string, log: Logger): Promise<void> => {
  const lockfile = await hasPackageLock(releaseDir);
  const args = lockfile
    ? ["ci", "--omit=dev"]
    : ["install", "--omit=dev"];

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
