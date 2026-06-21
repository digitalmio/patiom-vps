import { execa } from "execa";

export const getServiceState = async (name: string): Promise<string> => {
  try {
    const { stdout } = await execa("systemctl", ["is-active", name]);
    return stdout.trim();
  } catch {
    return "unknown";
  }
};

export const getServiceLogs = async (name: string, lines: number = 20): Promise<string[]> => {
  try {
    const { stdout } = await execa("journalctl", ["-u", name, "--no-pager", "-n", String(lines)]);
    return stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
};

export const getListeningPorts = async (): Promise<string[]> => {
  try {
    const { stdout } = await execa("ss", ["-tlnp"]);
    return stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
};
