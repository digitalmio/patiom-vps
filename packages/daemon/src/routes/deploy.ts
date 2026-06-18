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
import { enable, start, stop, daemonReload } from "../core/systemd";
import { addApp, type RpxyApp } from "../core/proxy";
import { ensureEnvFile } from "../core/env";
import { ensureStorageDir } from "../core/storage";
import { appServiceTemplate } from "../templates/systemd";
import { PATIOM_ROOT } from "../config";
import { writeLog } from "../core/logs";
import { requireScope } from "../middleware/scope";

export const deployRoute = new Hono();

const UNIT_FILE_PATH = "/etc/systemd/system";

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
  const script = pkg.scripts?.patiom || pkg.scripts?.start;

  if (!script) {
    throw new Error("No start script found (scripts.patiom or scripts.start)");
  }

  const parts = script.split(" ");
  if (parts[0] === "node") {
    return parts.slice(1).join(" ");
  }

  return script;
};

const writeUnitFile = async (appName: string, startScript: string): Promise<void> => {
  const fnmBinPath = "/home/patiom/.local/share/fnm/aliases/default/bin";
  const content = appServiceTemplate({ fnmBinPath, startScript });
  const unitPath = path.join(UNIT_FILE_PATH, `${appName}@.service`);
  await fs.writeFile(unitPath, content);
};

const manageInstances = async (
  appName: string,
  ports: number[],
  log: (msg: string) => void
): Promise<void> => {
  log("Stopping existing instances...");
  try {
    await stop(`${appName}@*`);
  } catch {
    // No instances running, ignore
  }

  log("Reloading systemd daemon...");
  await daemonReload();

  log("Enabling and starting new instances...");
  await Promise.all(
    ports.map(async (port) => {
      await enable(`${appName}@${port}`);
      await start(`${appName}@${port}`);
    })
  );
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

const updateRpxyConfig = async (
  appName: string,
  domains: string[],
  ports: number[],
  log: (msg: string) => void
): Promise<void> => {
  log("Updating rpxy config...");

  const upstreams = ports.map((port) => ({
    location: `127.0.0.1:${port}`,
    port,
  }));

  for (const domain of domains) {
    const app: RpxyApp = {
      host: domain,
      path: "/",
      upstream: {
        location: upstreams[0].location,
        port: upstreams[0].port,
      },
    };
    await addApp(app);
    log(`Added domain: ${domain}`);
  }
};

const parseDeployRequest = (formData: FormData) => {
  const zipFile = formData.get("zip") as File;
  const name = formData.get("name") as string;
  const type = formData.get("type") as string;
  const domainsJson = formData.get("domains") as string;
  const sslipDomain = formData.get("sslipDomain") === "true";
  const instances = parseInt(formData.get("instances") as string, 10);
  const dbFolder = formData.get("dbFolder") as string;
  const storageFolder = formData.get("storageFolder") as string;

  if (!zipFile || !name) {
    throw new Error("Missing required fields: zip, name");
  }

  const domains: string[] = JSON.parse(domainsJson || "[]");

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
  await log(`Using start script: ${startScript}`);

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
  const formData = await c.req.formData();
  const { zipFile, name, domains, sslipDomain, instances, dbFolder, storageFolder } =
    await parseDeployRequest(formData);

  const releaseId = ulid();
  c.set("releaseId", releaseId);
  const releaseDir = path.join(getReleasesDir(name), releaseId);

  await fs.mkdir(releaseDir, { recursive: true });
  await writeStatus(name, releaseId, "running");

  const zipBuffer = Buffer.from(await zipFile.arrayBuffer());

  executeDeploy(name, releaseId, zipBuffer, domains, sslipDomain, instances, dbFolder, storageFolder)
    .then(() => writeStatus(name, releaseId, "complete"))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      writeLog(name, releaseId, `Deployment failed: ${message}`);
      writeStatus(name, releaseId, "failed");
    });

  return c.json({ releaseId });
});

deployRoute.get("/:name/:releaseId/status", async (c) => {
  const name = c.req.param("name");
  const releaseId = c.req.param("releaseId");

  const status = await readStatus(name, releaseId);

  if (!status) {
    return c.json({ error: "Release not found" }, 404);
  }

  return c.json({ status });
});
