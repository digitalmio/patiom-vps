import fs from "node:fs/promises";
import path from "node:path";
import { consola } from "consola";

export const sanitizeAppName = (name: string): string =>
  name.replace(/^@[^/]+\//u, "").replaceAll(/[^a-zA-Z0-9._-]/gu, "-");

export const getAppName = async (): Promise<string> => {
  const cwd = process.cwd();
  const pkgPath = path.join(cwd, "package.json");

  try {
    const raw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw);

    if (!pkg.name) {
      consola.error("Missing 'name' field in package.json.");
      process.exit(1);
    }

    if (!pkg.patiom) {
      consola.error("This project hasn't been initialized for Patiom. Run `patiom init` first.");
      process.exit(1);
    }

    return pkg.patiom.name ?? sanitizeAppName(pkg.name);
  } catch {
    consola.error("No package.json found in the current directory. Run this from a project folder.");
    process.exit(1);
  }
};
