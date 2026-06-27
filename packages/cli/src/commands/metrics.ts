import pc from "picocolors";
import { consola } from "consola";
import { createApiClient } from "../core/api";
import { formatBytes, printTable } from "../core/ui";

type MetricsOptions = { app?: string; from?: string; to?: string };

type ServerMetric = {
  ts: string;
  cpuPct: number;
  memTotal: number;
  memUsed: number;
  memPct: number;
  loadAvg: [number, number, number];
  diskTotal: number;
  diskUsed: number;
};

type AppInstanceMetric = {
  port: number;
  cpuPct: number;
  memBytes: number;
  memMax: number | null;
};

type PerAppMetric = {
  ts: string;
  instances: AppInstanceMetric[];
};

const avg = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
};

const cpuColor = (pct: number): string => {
  if (pct > 80) return pc.red(`${pct.toFixed(1)}%`);
  if (pct > 50) return pc.yellow(`${pct.toFixed(1)}%`);
  return pc.green(`${pct.toFixed(1)}%`);
};

const showServerMetrics = async (api: ReturnType<typeof createApiClient>, from: string, to: string): Promise<void> => {
  const params = new URLSearchParams({ from, to });
  let data: { metrics: ServerMetric[] };
  try {
    data = await api<{ metrics: ServerMetric[] }>(`/metrics/server?${params}`);
  } catch (error) {
    consola.error(
      `Failed to fetch server metrics: ${error instanceof Error ? error.message : error}`,
    );
    consola.info("Make sure the daemon is running v0.0.11+ (run: patiom-server upgrade)");
    process.exit(1);
  }

  if (data.metrics.length === 0) {
    consola.info("No metrics collected yet. Wait for the first collection cycle (~60s).");
    return;
  }

  const last = data.metrics.at(-1)!;
  const cpuPcts = data.metrics.map((m) => m.cpuPct);
  const memUseds = data.metrics.map((m) => m.memUsed);

  const timeWindow = data.metrics.length >= 60
    ? `last ${Math.round(data.metrics.length / 60)}h`
    : `last ${data.metrics.length}m`;

  console.log("");
  console.log(`  ${pc.bold("Server metrics")} (${timeWindow})`);
  console.log("");

  const rows: string[][] = [
    ["CPU", cpuColor(last.cpuPct), cpuColor(avg(cpuPcts))],
    [
      "Memory",
      `${pc.bold(formatBytes(last.memUsed))} / ${formatBytes(last.memTotal)}`,
      `${pc.bold(formatBytes(avg(memUseds)))} / ${formatBytes(last.memTotal)}`,
    ],
    ["Memory %", pc.dim(`${last.memPct.toFixed(1)}%`), pc.dim(`${(avg(memUseds) / last.memTotal * 100).toFixed(1)}%`)],
    ["Load (1m/5m/15m)", pc.dim(last.loadAvg.map((n: number) => n.toFixed(2)).join(" / ")), pc.dim("—")],
    ["Disk", pc.dim(`${formatBytes(last.diskUsed)} / ${formatBytes(last.diskTotal)}`), pc.dim("—")],
  ];

  printTable(["Metric", "Now", "Avg"], rows);
  console.log("");
};

const showAppMetrics = async (api: ReturnType<typeof createApiClient>, appName: string, from: string, to: string): Promise<void> => {
  const params = new URLSearchParams({ from, to });
  let data: { metrics: PerAppMetric[] };
  try {
    data = await api<{ metrics: PerAppMetric[] }>(`/metrics/apps/${encodeURIComponent(appName)}?${params}`);
  } catch (error) {
    consola.error(
      `Failed to fetch metrics for '${appName}': ${error instanceof Error ? error.message : error}`,
    );
    consola.info("Make sure the daemon is running v0.0.11+ (run: patiom-server upgrade)");
    process.exit(1);
  }

  if (data.metrics.length === 0) {
    consola.info(`No metrics collected for ${appName} yet. Wait for the first collection cycle (~60s).`);
    return;
  }

  const allPorts = [...new Set(data.metrics.flatMap((m) => m.instances.map((i) => i.port)))].toSorted((a, b) => a - b);

  const timeWindow = data.metrics.length >= 60
    ? `last ${Math.round(data.metrics.length / 60)}h`
    : `last ${data.metrics.length}m`;

  console.log("");
  console.log(`  ${pc.bold(`App: ${appName}`)} (${timeWindow})`);
  console.log("");

  const rows = allPorts.map((port) => {
    const samples = data.metrics
      .map((m) => m.instances.find((i) => i.port === port))
      .filter((i): i is AppInstanceMetric => i !== undefined);

    if (samples.length === 0) return null;

    const last = samples.at(-1)!;
    const cpuPcts = samples.map((i) => i.cpuPct);

    const memStr = last.memMax === null
      ? formatBytes(last.memBytes)
      : `${formatBytes(last.memBytes)} / ${formatBytes(last.memMax)}`;

    return [
      String(port),
      cpuColor(last.cpuPct),
      cpuColor(avg(cpuPcts)),
      pc.dim(memStr),
    ];
  }).filter((r): r is string[] => r !== null);

  printTable(["Port", "CPU Now", "CPU Avg", "Mem / Max"], rows);
  console.log("");
};

const parseISO = (str: string): string => {
  const d = new Date(str);
  if (isNaN(d.getTime())) {
    consola.error(`Invalid date: ${str}. Use ISO 8601 (e.g. 2026-06-27T10:00:00Z)`);
    process.exit(1);
  }
  return d.toISOString();
};

export const metricsCommand = async (options: MetricsOptions): Promise<void> => {
  const api = createApiClient();

  const toISO = options.to ? parseISO(options.to) : new Date().toISOString();
  const fromISO = options.from ? parseISO(options.from) : new Date(Date.now() - 3_600_000).toISOString();

  if (options.app) {
    await showAppMetrics(api, options.app, fromISO, toISO);
  } else {
    await showServerMetrics(api, fromISO, toISO);
  }
};
