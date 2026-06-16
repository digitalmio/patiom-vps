import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";

export type Logger = (msg: string) => void;

export const hasLockfile = async (releaseDir: string): Promise<boolean> => {
  try {
    await fs.access(path.join(releaseDir, "pnpm-lock.yaml"));
    return true;
  } catch {
    return false;
  }
};

export const install = async (releaseDir: string, log: Logger): Promise<void> => {
  const frozen = await hasLockfile(releaseDir);
  const args = frozen ? ["install", "--frozen-lockfile"] : ["install"];

  log(`Running: pnpm ${args.join(" ")}`);

  const proc = execa("pnpm", args, {
    cwd: releaseDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.stdout?.on("data", (data) => log(data.toString().trim()));
  proc.stderr?.on("data", (data) => log(data.toString().trim()));

  await proc;
  log("Dependencies installed successfully");
};
