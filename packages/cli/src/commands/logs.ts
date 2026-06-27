import pc from "picocolors";
import { consola } from "consola";
import { createApiClient } from "../core/api";
import { getAppName } from "../core/app";
import { colorLogLine } from "../core/ui";

export type LogsOptions = {
  app?: string;
  follow?: boolean;
  lines?: number;
  port?: string;
};

type LogLine = { ts: string; port: number; message: string };
type LogsResponse = { lines: LogLine[]; cursors: Record<string, string> };

const formatLine = (line: LogLine, multi: boolean): string => {
  const ts = pc.dim(line.ts.slice(11, 19));
  const port = multi ? pc.cyan(`[${line.port}]`) : "";
  const msg = colorLogLine(line.message);
  return [ts, port, msg].filter(Boolean).join(" ");
};

const fetchLogs = (
  api: ReturnType<typeof createApiClient>,
  appName: string,
  lines: number,
  portFilter: string | undefined,
  cursors: Record<string, string>
): Promise<LogsResponse> => {
  const params = new URLSearchParams({ lines: String(lines) });
  if (portFilter) params.set("port", portFilter);
  if (Object.keys(cursors).length > 0) {
    params.set("cursors", JSON.stringify(cursors));
  }
  return api<LogsResponse>(`/apps/${encodeURIComponent(appName)}/logs?${params}`);
};

export const logsCommand = async (options: LogsOptions): Promise<void> => {
  const api = createApiClient();
  const appName = options.app ?? await getAppName();
  const lines = options.lines ?? 50;

  let data: LogsResponse;
  try {
    data = await fetchLogs(api, appName, lines, options.port, {});
  } catch {
    consola.error(`Failed to fetch logs. Make sure '${appName}' exists and the daemon is running.`);
    process.exit(1);
  }

  if (data.lines.length === 0) {
    consola.info(`No logs found for ${appName}.`);
    return;
  }

  const multi = data.lines.some((l) => l.port !== data.lines[0].port);
  data.lines.forEach((line) => console.log(formatLine(line, multi)));

  if (!options.follow) return;

  let lastCursors = data.cursors;

  process.on("SIGINT", () => process.exit());

  setInterval(async () => {
    try {
      const next = await fetchLogs(api, appName, lines, options.port, lastCursors);
      if (next.lines.length > 0) {
        next.lines.forEach((line) => console.log(formatLine(line, multi)));
        lastCursors = { ...lastCursors, ...next.cursors };
      }
    } catch {
      // silent — keep polling
    }
  }, 2000);
};
