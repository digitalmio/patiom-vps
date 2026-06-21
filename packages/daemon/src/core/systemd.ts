import { execa } from "execa";

export const daemonReload = () => execa("systemctl", ["daemon-reload"]);
export const enable = (name: string) => execa("systemctl", ["enable", name]);
export const start = (name: string) => execa("systemctl", ["start", name]);
export const stop = (name: string) => execa("systemctl", ["stop", name]);
export const restart = (name: string) => execa("systemctl", ["restart", name]);
export const status = (name: string) => execa("systemctl", ["status", name]);

const parseUnits = (stdout: string, appName: string): string[] =>
  stdout
    .split("\n")
    .filter((line) => line.includes(`${appName}@`))
    .map((line) => {
      const match = line.match(`${appName}@([0-9]+)\\.service`);
      return match ? match[1] : null;
    })
    .filter((port): port is string => port !== null);

export const listRunningInstances = async (appName: string): Promise<string[]> => {
  try {
    const { stdout } = await execa("systemctl", [
      "list-units",
      "--type=service",
      "--state=running",
      "--no-pager",
      "--plain",
      `${appName}@*`,
    ]);

    return parseUnits(stdout, appName);
  } catch {
    return [];
  }
};

export const listAllInstances = async (appName: string): Promise<string[]> => {
  try {
    const { stdout } = await execa("systemctl", [
      "list-units",
      "--type=service",
      "--all",
      "--no-pager",
      "--plain",
      `${appName}@*`,
    ]);

    return parseUnits(stdout, appName);
  } catch {
    return [];
  }
};
