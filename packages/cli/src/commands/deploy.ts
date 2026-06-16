import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { consola } from "consola";
import { detect } from "package-manager-detector/detect";
import { resolveCommand } from "package-manager-detector/commands";
import type { PatiomConfig, GlobalConfig } from "@patiom/shared";
import { archive } from "../core/archive";
import { getGlobalConfig } from "../core/api";

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

const upload = async (globalConfig: GlobalConfig, name: string, zipBuffer: Buffer, patiom: PatiomConfig) => {
  consola.start("Deploying to server...");

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

	const response = await fetch(`${globalConfig.url}/deploy`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${globalConfig.token}`,
		},
		body: formData,
	});

	if (!response.ok) {
		consola.error(`Deployment failed: ${response.status} ${response.statusText}`);
		const body = await response.text();
		if (body) consola.error(body);
		process.exit(1);
	}

	if (response.body) {
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			process.stdout.write(decoder.decode(value));
		}
	}
};

export const deployCommand = async (options: DeployOptions) => {
	console.log("");
	consola.start("Validating project...");

	const globalConfig = getGlobalConfig();
	const cwd = process.cwd();
  const pkg = await readProjectConfig(cwd);
  const patiom: PatiomConfig = pkg.patiom ?? {};

  if (!pkg.name) {
		consola.error("Missing 'name' field in package.json.");
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
    await upload(globalConfig, pkg.name, zipBuffer, patiom);
		console.log("");
		consola.success("Deployment complete.");
		console.log("");
	} catch (error) {
		consola.error(`Deployment failed: ${error instanceof Error ? error.message : error}`);
		process.exit(1);
	}
};
