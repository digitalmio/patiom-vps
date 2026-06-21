import { consola } from "consola";
import { createApiClient } from "../core/api";
import { getAppName } from "../core/app";

type StatusOptions = { app?: string; server?: boolean; lines?: number };

const showServerOverview = async () => {
  const api = createApiClient();
  const status = await api("/status");

  console.log("");
  consola.info(`Daemon v${status.daemon.version} (port ${status.daemon.port}, uptime ${Math.floor(status.daemon.uptime / 60)}m)`);
  consola.info(`rpxy: ${status.rpxy.state}`);
  if (status.rpxy.state !== "active" && status.rpxy.logs.length > 0) {
    status.rpxy.logs.slice(-5).forEach((line: string) => console.log(`  ${line}`));
  }

  let apps: string[];
  try {
    apps = await api("/apps");
  } catch {
    apps = [];
  }

  if (apps.length > 0) {
    consola.info("Apps:");
    apps.forEach((name: string) => console.log(`  ${name}`));
  } else {
    consola.info("No apps deployed");
  }

  if (status.ports.length > 0) {
    consola.info("Listening ports:");
    status.ports.forEach((line: string) => console.log(`  ${line}`));
  }
  console.log("");
};

const showAppDetails = async (name: string, lines: number) => {
  const api = createApiClient();

  let appStatus;
  try {
    appStatus = await api(`/apps/${name}/status?lines=${lines}`);
  } catch (error) {
    consola.error(`Failed to fetch status for '${name}': ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  console.log("");
  consola.info(`App: ${appStatus.name}`);
  if (appStatus.currentRelease) {
    console.log(`  Current release: ${appStatus.currentRelease}`);
  }
  if (appStatus.lastDeploy) {
    console.log(`  Last deploy: ${appStatus.lastDeploy.status} (${appStatus.lastDeploy.releaseId})`);
  }
  if (appStatus.instances.length > 0) {
    appStatus.instances.forEach((inst: { port: number; state: string; logs: string[] }) => {
      console.log(`  Port ${inst.port}: ${inst.state}`);
      if (inst.logs.length > 0) {
        inst.logs.forEach((line: string) => console.log(`    ${line}`));
      }
    });
  } else {
    consola.warn("No instances found");
  }
  console.log("");
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
