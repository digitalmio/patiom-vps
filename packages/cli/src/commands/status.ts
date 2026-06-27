import { consola } from "consola";
import pc from "picocolors";
import { createApiClient } from "../core/api";
import { getAppName } from "../core/app";
import { stateColor, createTable, printTable } from "../core/ui";

type StatusOptions = { app?: string; server?: boolean; lines?: number };

type AppSummary = {
  name: string;
  currentRelease: string | null;
  lastDeployStatus: string | null;
  instanceStates: { port: number; state: string }[];
  instanceCount: number;
  allActive: boolean;
};

type ServerStatus = {
  daemon: { version: string; uptime: number; port: number };
  rpxy: { state: string; logs: string[] };
  ports: string[];
};

const showServerOverview = async () => {
  const api = createApiClient();

  const [status, apps] = await Promise.all([
    api<ServerStatus>("/status"),
    api<AppSummary[]>("/apps").catch(() => [] as AppSummary[]),
  ]);

  console.log("");
  console.log(`  ${pc.bold(`Daemon v${status.daemon.version}`)}  port ${status.daemon.port}, uptime ${formatUptime(status.daemon.uptime)}`);
  console.log(`  rpxy  ${stateColor(status.rpxy.state)}`);
  console.log("");

  if (status.rpxy.state !== "active" && status.rpxy.logs.length > 0) {
    status.rpxy.logs.slice(-5).forEach((line: string) => console.log(`    ${pc.dim(line)}`));
    console.log("");
  }

  if (apps.length > 0) {
    let rows: string[][];
    if (typeof apps[0] === "string") {
      rows = (apps as string[]).map((name) => [name, pc.dim("—"), pc.dim("—"), pc.dim("—")]);
    } else {
      rows = (apps as AppSummary[]).map((app) => [
        app.name,
        app.currentRelease ? app.currentRelease.slice(0, 12) + "…" : pc.dim("—"),
        app.lastDeployStatus ? stateColor(app.lastDeployStatus) : pc.dim("—"),
        app.allActive
          ? pc.green(`${app.instanceCount} active`)
          : `${app.instanceCount} ${pc.red("inactive")}`,
      ]);
    }
    printTable(["Name", "Release", "Status", "Instances"], rows);
    console.log("");
  }

  if (status.ports.length > 0) {
    const portRows = status.ports
      .filter((line: string) => /LISTEN/u.test(line))
      .map((line: string) => {
        const fields = line.split(/\s+/u).filter(Boolean);
        const addr = fields[3];
        if (!addr) return null;
        const port = addr.split(":").pop()!;
        const processField = fields.at(-1)!;
        const process = processField.match(/"([^"]+)"/u)?.[1] ?? processField;
        return [port, process];
      })
      .filter(Boolean) as string[][];

    if (portRows.length > 0) {
      const portTable = createTable(["Port", "Process"], portRows, { colWidths: [12, 50] });
      console.log(`  ${pc.bold("Listening ports")}`);
      console.log(portTable);
      console.log("");
    }
  }
};

const showAppDetails = async (name: string, lines: number) => {
  const api = createApiClient();

  let appStatus;
  try {
    appStatus = await api<{
      name: string;
      currentRelease: string | null;
      lastDeploy: { status: string; releaseId: string } | null;
      instances: { port: number; state: string; logs: string[] }[];
    }>(`/apps/${name}/status?lines=${lines}`);
  } catch (error) {
    consola.error(`Failed to fetch status for '${name}': ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  console.log("");
  console.log(`  ${pc.bold(`App: ${appStatus.name}`)}`);

  if (appStatus.currentRelease) {
    console.log(`  ${pc.dim("release")}  ${appStatus.currentRelease}`);
  }
  if (appStatus.lastDeploy) {
    const statusLabel = stateColor(appStatus.lastDeploy.status);
    console.log(`  ${pc.dim("deploy")}  ${statusLabel} (${appStatus.lastDeploy.releaseId})`);
  }

  console.log("");

  if (appStatus.instances.length > 0) {
    const rows = appStatus.instances.map((inst) => [
      String(inst.port),
      stateColor(inst.state),
      inst.logs.length > 0 ? pc.dim(inst.logs.at(-1)!.slice(0, 80)) : pc.dim("—"),
    ]);

    printTable(["Port", "State", "Last log"], rows, { colWidths: [10, 14, 80] });
  } else {
    consola.warn("No instances found");
  }
  console.log("");
};

const formatUptime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
};

export const statusCommand = async (options: StatusOptions) => {
  const lines = options.lines ?? 20;

  if (options.server) {
    await showServerOverview();
    return;
  }

  if (options.app) {
    await showAppDetails(options.app, lines);
    return;
  }

  try {
    const appName = await getAppName();
    await showAppDetails(appName, lines);
  } catch {
    await showServerOverview();
  }
};
