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

export type JournalEntry = {
  ts: string;
  message: string;
  cursor: string;
};

export const getServiceLogsJson = async (
  unit: string,
  lines: number,
  cursor?: string
): Promise<JournalEntry[]> => {
  const args = ["-u", unit, "--no-pager", "-n", String(lines), "--output=json"];
  if (cursor) args.splice(2, 0, `--after-cursor=${cursor}`);
  try {
    const { stdout } = await execa("journalctl", args);
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          const obj = JSON.parse(line) as {
            __REALTIME_TIMESTAMP: string;
            MESSAGE: string;
            __CURSOR: string;
          };
          return {
            ts: new Date(Number(obj.__REALTIME_TIMESTAMP) / 1000).toISOString(),
            message: obj.MESSAGE,
            cursor: obj.__CURSOR,
          };
        } catch {
          return null;
        }
      })
      .filter((e): e is JournalEntry => e !== null);
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
