import fs from "node:fs/promises";
import path from "node:path";
import { consola } from "consola";
import { updatePackage } from "write-package";

export const initCommand = async () => {
	console.log("");
	consola.start("Bootstrapping project...");

	const cwd = process.cwd();
	const pkgPath = path.join(cwd, "package.json");

	try {
		await fs.access(pkgPath);
	} catch {
		consola.error("package.json not found. Patiom requires a package.json file.");
		process.exit(1);
	}

	const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));

	if (pkg.patiom) {
		consola.error("'patiom' key already exists in package.json.");
		process.exit(1);
	}

	await updatePackage(cwd, { patiom: { include: [] } });

	console.log("");
	consola.success("Added 'patiom.include' to package.json.");
	console.log("");
};
