import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execa } from "execa";
import {
  PATIOM_ROOT,
  METRICS_SERVER_DIR,
  METRICS_APPS_DIR,
  DEFAULT_METRICS_INTERVAL_MS,
  DEFAULT_METRICS_RETENTION_DAYS,
  APPS_DIR,
} from "../config";
import { listAllInstances } from "./systemd";

export type ServerMetric = {
  ts: string;
  cpuPct: number;
  memTotal: number;
  memUsed: number;
  memPct: number;
  loadAvg: [number, number, number];
  diskTotal: number;
  diskUsed: number;
};

export type AppInstanceMetric = {
  port: number;
  cpuPct: number;
  memBytes: number;
  memMax: number | null;
};

type AppMetric = {
  ts: string;
  apps: Record<string, AppInstanceMetric[]>;
};

export type PerAppMetric = {
  ts: string;
  instances: AppInstanceMetric[];
};

type StartOpts = {
  intervalMs?: number;
  retentionDays?: number;
};

type CpuState = { total: number; idle: number };

let prevServerCpu: CpuState | null = null;
const prevAppCpu = new Map<string, number>();
const cgroupPathCache = new Map<string, string>();
let intervalMs = DEFAULT_METRICS_INTERVAL_MS;
let retentionDays = DEFAULT_METRICS_RETENTION_DAYS;
let isV2 = true;

const getDateStr = (d: Date): string => d.toISOString().slice(0, 10);

const readProcStat = async (): Promise<CpuState> => {
  const stat = await fs.readFile("/proc/stat", "utf-8");
  const line = stat.split("\n").find((l) => l.startsWith("cpu "));
  if (!line) throw new Error("No cpu line in /proc/stat");
  const parts = line.trim().split(/\s+/u).slice(1).map(Number);
  const total = parts.reduce((a, b) => a + b, 0);
  const idle = parts[3] + (parts[4] ?? 0);
  return { total, idle };
};

const parseMemInfo = async (): Promise<{ memTotal: number; memAvailable: number }> => {
  const text = await fs.readFile("/proc/meminfo", "utf-8");
  const memTotal = Number(text.match(/MemTotal:\s+(\d+)/u)?.[1]) * 1024;
  const memAvailable = Number(text.match(/MemAvailable:\s+(\d+)/u)?.[1]) * 1024;
  return { memTotal, memAvailable };
};

const getDiskUsage = async (): Promise<{ diskTotal: number; diskUsed: number }> => {
  const s = await fs.statfs(PATIOM_ROOT);
  const diskTotal = s.blocks * s.bsize;
  const diskFree = s.bavail * s.bsize;
  return { diskTotal, diskUsed: diskTotal - diskFree };
};

export const collectServerMetrics = async (): Promise<ServerMetric | null> => {
  try {
    const [cpu, mem, loadAvg, disk] = await Promise.all([
      readProcStat(),
      parseMemInfo(),
      os.loadavg(),
      getDiskUsage(),
    ]);

    let cpuPct = 0;
    if (prevServerCpu) {
      const totalDelta = cpu.total - prevServerCpu.total;
      const idleDelta = cpu.idle - prevServerCpu.idle;
      cpuPct = totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0;
    }
    prevServerCpu = cpu;

    const memUsed = mem.memTotal - mem.memAvailable;
    const memPct = mem.memTotal > 0 ? (memUsed / mem.memTotal) * 100 : 0;

    return {
      ts: new Date().toISOString(),
      cpuPct: Math.round(cpuPct * 100) / 100,
      memTotal: mem.memTotal,
      memUsed,
      memPct: Math.round(memPct * 100) / 100,
      loadAvg: [loadAvg[0], loadAvg[1], loadAvg[2]],
      diskTotal: disk.diskTotal,
      diskUsed: disk.diskUsed,
    };
  } catch {
    return null;
  }
};

const getCgroupPath = async (appName: string, port: string): Promise<string | null> => {
  const key = `${appName}@${port}`;
  const cached = cgroupPathCache.get(key);
  if (cached) return cached;

  const staticPath = `/sys/fs/cgroup/system.slice/system-${appName}.slice/${appName}@${port}.service`;
  try {
    await fs.access(staticPath);
    cgroupPathCache.set(key, staticPath);
    return staticPath;
  } catch {
    // fallback to systemctl
  }

  try {
    const { stdout } = await execa("systemctl", [
      "show", `${appName}@${port}`,
      "-p", "ControlGroup",
      "--value",
    ]);
    const cgPath = stdout.trim();
    if (cgPath) {
      const fullPath = `/sys/fs/cgroup${cgPath}`;
      cgroupPathCache.set(key, fullPath);
      return fullPath;
    }
  } catch {
    // unit may not exist
  }
  return null;
};

export const collectAppMetrics = async (): Promise<AppMetric | null> => {
  if (!isV2) return null;

  try {
    const entries = await fs.readdir(APPS_DIR);
    const appNames = (await Promise.all(
      entries.map(async (entry) => {
        try {
          const stat = await fs.stat(path.join(APPS_DIR, entry));
          return stat.isDirectory() ? entry : null;
        } catch {
          return null;
        }
      })
    )).filter((n): n is string => n !== null);

    const apps: Record<string, AppInstanceMetric[]> = {};

    await Promise.all(
      appNames.map(async (appName) => {
        const ports = await listAllInstances(appName);
        const instances: AppInstanceMetric[] = [];

        await Promise.all(
          ports.map(async (port) => {
            const cgPath = await getCgroupPath(appName, port);
            if (!cgPath) return;

            try {
              const [memCurrentStr, memMaxStr, cpuStatText] = await Promise.all([
                fs.readFile(path.join(cgPath, "memory.current"), "utf-8"),
                fs.readFile(path.join(cgPath, "memory.max"), "utf-8"),
                fs.readFile(path.join(cgPath, "cpu.stat"), "utf-8"),
              ]);

              const memBytes = Number(memCurrentStr.trim());
              const memMaxRaw = memMaxStr.trim();
              const memMax = memMaxRaw === "max" ? null : Number(memMaxRaw);

              const usageUsec = Number(cpuStatText.match(/usage_usec (\d+)/u)?.[1] ?? 0);
              const key = `${appName}@${port}`;
              const prev = prevAppCpu.get(key);

              let cpuPct = 0;
              if (prev !== undefined && prev > 0) {
                const deltaUsec = usageUsec - prev;
                cpuPct = intervalMs > 0 ? (deltaUsec / (intervalMs * 1000)) * 100 : 0;
              }
              prevAppCpu.set(key, usageUsec);

              instances.push({
                port: Number(port),
                cpuPct: Math.round(cpuPct * 100) / 100,
                memBytes,
                memMax,
              });
            } catch {
              // instance may have stopped between listing and reading
            }
          })
        );

        if (instances.length > 0) {
          apps[appName] = instances;
        }
      })
    );

    return { ts: new Date().toISOString(), apps };
  } catch {
    return null;
  }
};

const appendNdjson = async (dir: string, data: Record<string, unknown>): Promise<void> => {
  const filePath = path.join(dir, `${getDateStr(new Date())}.ndjson`);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(filePath, JSON.stringify(data) + "\n", "utf-8");
};

const cleanupOldFiles = async (dir: string): Promise<void> => {
  try {
    const files = await fs.readdir(dir);
    const now = Date.now();
    const cutoff = now - retentionDays * 86_400_000;
    await Promise.all(
      files
        .filter((f) => f.endsWith(".ndjson"))
        .map(async (f) => {
          const dateStr = f.slice(0, 10);
          const fileDate = new Date(dateStr).getTime();
          if (!isNaN(fileDate) && fileDate < cutoff) {
            await fs.unlink(path.join(dir, f));
          }
        })
    );
  } catch {
    // dir may not exist yet
  }
};

export const readMetricsRange = async <T>(
  dir: string,
  fromDate: Date,
  toDate: Date
): Promise<T[]> => {
  const results: T[] = [];
  let cursor = new Date(fromDate);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= toDate) {
    const filePath = path.join(dir, `${getDateStr(cursor)}.ndjson`);
    const text = await fs.readFile(filePath, "utf-8").catch(() => "");
    const lines = text.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as T & { ts: string };
        const ts = new Date(obj.ts).getTime();
        if (ts >= fromDate.getTime() && ts <= toDate.getTime()) {
          results.push(obj);
        }
      } catch {
        // skip malformed line
      }
    }
    cursor = new Date(cursor.getTime() + 86_400_000);
  }

  results.sort((a, b) => {
    const aTs = new Date((a as unknown as { ts: string }).ts).getTime();
    const bTs = new Date((b as unknown as { ts: string }).ts).getTime();
    return aTs - bTs;
  });

  return results;
};

export const startMetricsCollection = async (opts?: StartOpts): Promise<void> => {
  intervalMs = opts?.intervalMs ?? (Number(process.env.METRICS_INTERVAL_MS) || DEFAULT_METRICS_INTERVAL_MS);
  retentionDays = opts?.retentionDays ?? (Number(process.env.METRICS_RETENTION_DAYS) || DEFAULT_METRICS_RETENTION_DAYS);

  try {
    await fs.access("/sys/fs/cgroup/cgroup.controllers");
    isV2 = true;
  } catch {
    console.warn("cgroup v2 not detected — per-app metrics will not be collected");
    isV2 = false;
  }

  await fs.mkdir(METRICS_SERVER_DIR, { recursive: true });
  await fs.mkdir(METRICS_APPS_DIR, { recursive: true });

  await cleanupAllMetricsDirs();

  const tick = async () => {
    const serverMetric = await collectServerMetrics();
    if (serverMetric) {
      await appendNdjson(METRICS_SERVER_DIR, serverMetric as unknown as Record<string, unknown>);
    }

    if (isV2) {
      const appMetric = await collectAppMetrics();
      if (appMetric) {
        await Promise.all(
          Object.entries(appMetric.apps).map(async ([appName, instances]) => {
            const appDir = path.join(METRICS_APPS_DIR, appName);
            await appendNdjson(appDir, { ts: appMetric.ts, instances } as unknown as Record<string, unknown>);
          })
        );
      }
    }
  };

  // Initial sample (no CPU delta, but establishes baseline)
  await tick();

  setInterval(tick, intervalMs);

  // Periodic cleanup every 24h
  setInterval(cleanupAllMetricsDirs, 86_400_000);
};

const cleanupAllMetricsDirs = async (): Promise<void> => {
  await cleanupOldFiles(METRICS_SERVER_DIR);
  try {
    const appDirs = await fs.readdir(METRICS_APPS_DIR);
    await Promise.all(
      appDirs.map(async (appDir) => {
        const fullPath = path.join(METRICS_APPS_DIR, appDir);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          await cleanupOldFiles(fullPath);
        }
      })
    );
  } catch {
    // apps dir may not exist yet
  }
};
