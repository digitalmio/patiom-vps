import fs from "node:fs/promises";
import path from "node:path";
import { consola } from "consola";

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

    return pkg.name;
  } catch {
    consola.error("package.json not found. Run this command from your project directory.");
    process.exit(1);
  }
};
