import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import {
  extractArchive,
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

export const deployRoute = new Hono();

const UNIT_FILE_PATH = "/etc/systemd/system";

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

const prepareRelease = async (
  name: string,
  zipFile: File,
  dbFolder: string,
  storageFolder: string,
  log: (msg: string) => void
): Promise<{ releaseId: string; releaseDir: string }> => {
  log(`Starting deployment for ${name}...`);

  const zipBuffer = Buffer.from(await zipFile.arrayBuffer());

  log("Extracting archive...");
  const releaseId = await extractArchive(name, zipBuffer, log);
  const releaseDir = path.join(getReleasesDir(name), releaseId);

  log("Creating symlinks...");
  await createSymlinks(name, releaseId, dbFolder, storageFolder, log);

  log("Ensuring .env file exists...");
  await ensureEnvFile(name, log);

  log("Ensuring storage directory exists...");
  await ensureStorageDir(name, storageFolder, log);

  log("Installing dependencies...");
  await install(releaseDir, log);

  return { releaseId, releaseDir };
};

const activateRelease = async (
  name: string,
  releaseId: string,
  releaseDir: string,
  instances: number,
  domains: string[],
  sslipDomain: boolean,
  log: (msg: string) => void
): Promise<{ releaseId: string; domains: string[]; ports: number[] }> => {
  log("Detecting start script...");
  const startScript = await getStartScript(releaseDir);
  log(`Using start script: ${startScript}`);

  log("Writing systemd unit file...");
  await writeUnitFile(name, startScript);

  log("Allocating ports...");
  const ports = await allocatePortBlock(instances, log);

  log("Swapping current symlink...");
  await swapCurrentSymlink(name, releaseId, log);

  log("Managing systemd instances...");
  await manageInstances(name, ports, log);

  const allDomains: string[] = [...domains];
  if (sslipDomain) {
    const sslip = await buildSslipDomain(name);
    if (sslip) allDomains.push(sslip);
  }

  if (allDomains.length > 0) {
    await updateRpxyConfig(name, allDomains, ports, log);
  }

  log(`Deployment complete!`);
  log(`Domains: ${allDomains.join(", ") || "none"}`);
  log(`Ports: ${ports.join(", ")}`);

  return { releaseId, domains: allDomains, ports };
};

const executeDeploy = async (
  name: string,
  zipFile: File,
  domains: string[],
  sslipDomain: boolean,
  instances: number,
  dbFolder: string,
  storageFolder: string,
  log: (msg: string) => void
) => {
  const { releaseId, releaseDir } = await prepareRelease(
    name,
    zipFile,
    dbFolder,
    storageFolder,
    log
  );

  return activateRelease(name, releaseId, releaseDir, instances, domains, sslipDomain, log);
};

deployRoute.post("/", async (c) => {
  const logMessages: string[] = [];
  const log = (msg: string) => logMessages.push(msg);

  try {
    const formData = await c.req.formData();
    const { zipFile, name, domains, sslipDomain, instances, dbFolder, storageFolder } =
      await parseDeployRequest(formData);

    const result = await executeDeploy(
      name,
      zipFile,
      domains,
      sslipDomain,
      instances,
      dbFolder,
      storageFolder,
      log
    );

    return c.json({
      success: true,
      ...result,
      logs: logMessages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Deployment failed: ${message}`);
    return c.json({ success: false, error: message, logs: logMessages }, 500);
  }
});
