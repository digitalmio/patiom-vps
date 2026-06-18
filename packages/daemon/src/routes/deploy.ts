import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { ulid } from "ulid";
import {
  createSymlinks,
  swapCurrentSymlink,
  getReleasesDir,
} from "../core/releases";
import { install } from "../core/pnpm";
import { allocatePortBlock } from "../core/ports";
import { enable, start, stop, daemonReload, listRunningInstances } from "../core/systemd";
import { addApp, removeApp } from "../core/proxy";
import { ensureEnvFile } from "../core/env";
import { ensureStorageDir } from "../core/storage";
import { appServiceTemplate } from "../templates/systemd";
import {
  PATIOM_ROOT,
  DEFAULT_INSTANCES,
  DEFAULT_DB_FOLDER,
  DEFAULT_STORAGE_FOLDER,
} from "../config";
import { writeLog } from "../core/logs";
import { requireScope } from "../middleware/scope";
import { validateAppName, validateReleaseId } from "../core/validation";

export const deployRoute = new Hono();

const UNIT_FILE_PATH = "/etc/systemd/system";
const activeDeploys = new Set<string>();

type DeployStatus = "running" | "complete" | "failed";

const getStatusPath = (appName: string, releaseId: string): string => {
  return path.join(getReleasesDir(appName), releaseId, "status");
};

const writeStatus = async (
  appName: string,
  releaseId: string,
  status: DeployStatus
): Promise<void> => {
  await fs.writeFile(getStatusPath(appName, releaseId), status);
};

export const readStatus = async (
  appName: string,
  releaseId: string
): Promise<DeployStatus | null> => {
  try {
    const content = await fs.readFile(getStatusPath(appName, releaseId), "utf-8");
    return content.trim() as DeployStatus;
  } catch {
    return null;
  }
};

const getStartScript = async (releaseDir: string): Promise<string> => {
  const pkgPath = path.join(releaseDir, "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));

  if (pkg.scripts?.patiom) return "patiom";
  if (pkg.scripts?.start) return "start";

  throw new Error("No start script found (scripts.patiom or scripts.start)");
};

const writeUnitFile = async (appName: string, startScript: string): Promise<void> => {
  const nodeBinPath = path.dirname(process.execPath);
  const content = appServiceTemplate({ nodeBinPath, startScript });
  const unitPath = path.join(UNIT_FILE_PATH, `${appName}@.service`);
  await fs.writeFile(unitPath, content);
};

const manageInstances = async (
  appName: string,
  ports: number[],
  log: (msg: string) => void
): Promise<void> => {
  log("Detecting running instances...");
  const oldPorts = await listRunningInstances(appName);
  log(`Found ${oldPorts.length} running instance(s)`);

  log("Reloading systemd daemon...");
  await daemonReload();

  log("Enabling and starting new instances...");
  await Promise.all(
    ports.map(async (port) => {
      await enable(`${appName}@${port}`);
      await start(`${appName}@${port}`);
    })
  );

  const portsToStop = oldPorts.filter((port) => !ports.includes(parseInt(port, 10)));
  if (portsToStop.length > 0) {
    log(`Stopping ${portsToStop.length} old instance(s)...`);
    await Promise.all(
      portsToStop.map(async (port) => {
        try {
          await stop(`${appName}@${port}`);
        } catch {
          // Instance may have already stopped, ignore
        }
      })
    );
  }
};

const buildSslipDomain = async (appName: string): Promise<string | null> => {
  try {
    const ip = await fs.readFile(path.join(PATIOM_ROOT, "ip"), "utf-8");
    const ipDashes = ip.trim().replaceAll(".", "-");
    return `${appName}.${ipDashes}.sslip.io`;
  } catch {
    return null;
  }
};

const sanitizeDomain = (domain: string): string => domain.replaceAll(/[^a-zA-Z0-9-]/gu, "-");

const updateRpxyConfig = async (
  appName: string,
  domains: string[],
  ports: number[],
  log: (msg: string) => void
): Promise<void> => {
  log("Updating rpxy config...");
  await removeApp(appName);

  for (const domain of domains) {
    const rpxyAppName = domains.length > 1 ? `${appName}-${sanitizeDomain(domain)}` : appName;
    await addApp(rpxyAppName, domain, ports);
    log(`Added domain: ${domain}`);
  }
};

const parseDeployRequest = (formData: FormData) => {
  const zipFile = formData.get("zip") as File;
  const name = formData.get("name") as string;
  const type = formData.get("type") as string;
  const domainsJson = formData.get("domains") as string;
  const sslipDomain = formData.get("sslipDomain") === "true" || formData.get("sslipDomain") === null;
  const instancesRaw = formData.get("instances") as string | null;
  const instances = instancesRaw ? parseInt(instancesRaw, 10) || DEFAULT_INSTANCES : DEFAULT_INSTANCES;
  const dbFolder = (formData.get("dbFolder") as string) || DEFAULT_DB_FOLDER;
  const storageFolder = (formData.get("storageFolder") as string) || DEFAULT_STORAGE_FOLDER;

  if (!zipFile || !name) {
    throw new Error("Missing required fields: zip, name");
  }

  const domains: string[] = JSON.parse(domainsJson || "[]");

  if (domains.length === 0 && !sslipDomain) {
    throw new Error("Must specify at least one of `domains` or `sslipDomain: true`");
  }

  return { zipFile, name, type, domains, sslipDomain, instances, dbFolder, storageFolder };
};

const executeDeploy = async (
  name: string,
  releaseId: string,
  zipBuffer: Buffer,
  domains: string[],
  sslipDomain: boolean,
  instances: number,
  dbFolder: string,
  storageFolder: string
) => {
  const log = (msg: string) => writeLog(name, releaseId, msg);

  await log(`Starting deployment for ${name}...`);

  await log("Extracting archive...");
  const releaseDir = path.join(getReleasesDir(name), releaseId);
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(zipBuffer);
  zip.extractAllTo(releaseDir, true);

  await log("Creating symlinks...");
  await createSymlinks(name, releaseId, dbFolder, storageFolder, log);

  await log("Ensuring .env file exists...");
  await ensureEnvFile(name, log);

  await log("Ensuring storage directory exists...");
  await ensureStorageDir(name, storageFolder, log);

  await log("Installing dependencies...");
  await install(releaseDir, log);

  await log("Detecting start script...");
  const startScript = await getStartScript(releaseDir);
  await log(`Using start script: pnpm run ${startScript}`);

  await log("Writing systemd unit file...");
  await writeUnitFile(name, startScript);

  await log("Allocating ports...");
  const ports = await allocatePortBlock(instances, log);

  await log("Swapping current symlink...");
  await swapCurrentSymlink(name, releaseId, log);

  await log("Managing systemd instances...");
  await manageInstances(name, ports, log);

  const allDomains: string[] = [...domains];
  if (sslipDomain) {
    const sslip = await buildSslipDomain(name);
    if (sslip) allDomains.push(sslip);
  }

  if (allDomains.length > 0) {
    await updateRpxyConfig(name, allDomains, ports, log);
  }

  await log(`Deployment complete!`);
  await log(`Domains: ${allDomains.join(", ") || "none"}`);
  await log(`Ports: ${ports.join(", ")}`);

  return { releaseId, domains: allDomains, ports };
};

declare module "hono" {
  interface ContextVariableMap {
    releaseId: string;
  }
}

deployRoute.post("/", requireScope("rw"), async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  let parsed: ReturnType<typeof parseDeployRequest>;
  try {
    parsed = await parseDeployRequest(formData);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid request" }, 400);
  }

  const { zipFile, name, domains, sslipDomain, instances, dbFolder, storageFolder } = parsed;

  try {
    validateAppName(name);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid input" }, 400);
  }

  if (activeDeploys.has(name)) {
    return c.json({ error: "Deployment already in progress for this app" }, 409);
  }

  const releaseId = ulid();
  c.set("releaseId", releaseId);
  const releaseDir = path.join(getReleasesDir(name), releaseId);

  await fs.mkdir(releaseDir, { recursive: true });
  await writeStatus(name, releaseId, "running");

  let zipBuffer: Buffer;
  try {
    zipBuffer = Buffer.from(await zipFile.arrayBuffer());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeLog(name, releaseId, `Deployment failed: ${message}`);
    await writeStatus(name, releaseId, "failed");
    return c.json({ error: "Failed to read upload" }, 500);
  }

  activeDeploys.add(name);

  executeDeploy(name, releaseId, zipBuffer, domains, sslipDomain, instances, dbFolder, storageFolder)
    .then(() => writeStatus(name, releaseId, "complete"))
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await writeLog(name, releaseId, `Deployment failed: ${message}`);
      await writeStatus(name, releaseId, "failed");
    })
    .finally(() => {
      activeDeploys.delete(name);
    });

  return c.json({ releaseId });
});

deployRoute.get("/:name/:releaseId/status", async (c) => {
  const name = c.req.param("name");
  const releaseId = c.req.param("releaseId");

  try {
    validateAppName(name);
    validateReleaseId(releaseId);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid input" }, 400);
  }

  const status = await readStatus(name, releaseId);

  if (!status) {
    return c.json({ error: "Release not found" }, 404);
  }

  return c.json({ status });
});
