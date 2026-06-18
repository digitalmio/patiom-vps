import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { consola } from "consola";
import { detect } from "package-manager-detector/detect";
import { resolveCommand } from "package-manager-detector/commands";
import type { PatiomConfig } from "../types";
import { archive } from "../core/archive";
import { getGlobalConfig, createApiClient } from "../core/api";

const execAsync = promisify(exec);

export type DeployOptions = {
  prod: boolean;
  dryRun: boolean;
};

const readProjectConfig = async (cwd: string) => {
	const pkgPath = path.join(cwd, "package.json");

	try {
		const raw = await fs.readFile(pkgPath, "utf-8");
		return JSON.parse(raw);
	} catch {
		consola.error("package.json not found.");
		process.exit(1);
	}
};

const runBuild = async (cwd: string, pkg: { scripts?: Record<string, string> }) => {
	if (!pkg.scripts?.build) {
		return;
	}

	const pm = await detect({ cwd });

	if (!pm) {
		consola.warn("No package manager detected, skipping build step.");
		return;
	}

	const resolved = resolveCommand(pm.agent, "run", ["build"]);
	if (!resolved) {
		consola.warn("Could not resolve build command, skipping build step.");
		return;
	}
	const { command, args } = resolved;
	consola.start(`Running build: ${command} ${args.join(" ")}`);
	try {
		const { stdout, stderr } = await execAsync(`${command} ${args.join(" ")}`, { cwd });
		if (stderr) console.error(stderr);
		if (stdout) console.log(stdout);
	} catch {
		consola.error(`Build failed.`);
		process.exit(1);
	}
	consola.success("Build complete.");
};

type DeployResponse = {
  releaseId: string;
};

type LogsResponse = {
  lines: string[];
  nextOffset: number;
  done: boolean;
  status?: "complete" | "failed";
};

const MAX_POLL_TIMEOUT = 10 * 60 * 1000;
const POLL_INTERVAL = 500;
const POLL_TIMEOUT = 5000;

const upload = async (name: string, zipBuffer: Buffer, patiom: PatiomConfig) => {
  consola.start("Deploying to server...");
  console.log("");

  const api = createApiClient();

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(zipBuffer)]);
  formData.append("zip", blob, `${name}.zip`);
  formData.append("name", name);
  formData.append("type", "node");
  formData.append("domains", JSON.stringify(patiom.domains ?? []));
  formData.append("sslipDomain", String(patiom.sslipDomain ?? true));
  formData.append("instances", String(patiom.instances ?? 1));
  formData.append("dbFolder", patiom.dbFolder ?? "db");
  formData.append("storageFolder", patiom.storageFolder ?? "storage");

  let releaseId: string;
  try {
    const response = await api<DeployResponse>("/deploy", {
      method: "POST",
      body: formData,
      timeout: 120000,
      retry: 0,
    });
    releaseId = response.releaseId;
  } catch (error) {
    consola.error(`Deployment failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  let offset = 0;
  let done = false;
  let deployStatus: "complete" | "failed" | undefined;
  const startTime = Date.now();

  while (!done) {
    if (Date.now() - startTime > MAX_POLL_TIMEOUT) {
      consola.error("Deployment polling timed out after 10 minutes");
      process.exit(1);
    }

    try {
      const logsResponse = await api<LogsResponse>(`/logs/${name}/${releaseId}?offset=${offset}`, {
        timeout: POLL_TIMEOUT,
      });

      logsResponse.lines.map((line) => console.log(`  ${line}`));
      offset = logsResponse.nextOffset;
      done = logsResponse.done;
      if (logsResponse.status) {
        deployStatus = logsResponse.status;
      }
    } catch (error) {
      consola.warn(`Log fetch failed: ${error instanceof Error ? error.message : error}`);
    }

    if (!done) {
      await new Promise((resolve) => {
        setTimeout(resolve, POLL_INTERVAL);
      });
    }
  }

  console.log("");

  try {
    const finalLogs = await api<LogsResponse>(`/logs/${name}/${releaseId}?offset=${offset}`, {
      timeout: POLL_TIMEOUT,
    });
    finalLogs.lines.map((line) => console.log(`  ${line}`));
  } catch {
    // Final log fetch failed, but deploy is done
  }

  if (deployStatus === "failed") {
    consola.error("Deployment failed");
    process.exit(1);
  }
};

export const deployCommand = async (options: DeployOptions) => {
	console.log("");
	consola.start("Validating project...");

	getGlobalConfig();
	const cwd = process.cwd();
  const pkg = await readProjectConfig(cwd);
  const patiom: PatiomConfig = pkg.patiom ?? {};

  if (!pkg.name) {
		consola.error("Missing 'name' field in package.json.");
		process.exit(1);
	}

	const hasDomains = (patiom.domains?.length ?? 0) > 0;
	const sslipEnabled = patiom.sslipDomain ?? true;
	if (!hasDomains && !sslipEnabled) {
		consola.error("Must specify at least one of `domains` or `sslipDomain: true` in package.json");
		process.exit(1);
	}

	consola.success("Project validated.");

	await runBuild(cwd, pkg);

	consola.start("Creating archive...");
	const zipBuffer = await archive({
		cwd,
		include: pkg.patiom?.include ?? [],
	});
	consola.success(`Archive created (${(zipBuffer.length / 1024).toFixed(1)} KB)`);

	if (options.dryRun) {
		const dryRunPath = path.join(cwd, ".patiom", `${pkg.name}.zip`);
		await fs.mkdir(path.dirname(dryRunPath), { recursive: true });
		await fs.writeFile(dryRunPath, zipBuffer);
		consola.info(`Dry run complete. Archive saved to ${dryRunPath}`);
		console.log("");
		return;
	}

	try {
    await upload(pkg.name, zipBuffer, patiom);
		console.log("");
		consola.success("Deployment complete.");
		console.log("");
	} catch (error) {
		consola.error(`Deployment failed: ${error instanceof Error ? error.message : error}`);
		process.exit(1);
	}
};
