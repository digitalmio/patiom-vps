import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { consola } from "consola";
import type { GlobalConfig } from "@patiom/shared";

const CONFIG_PATH = path.join(os.homedir(), ".patiom", "config.json");

const readGlobalConfig = async (): Promise<GlobalConfig> => {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    consola.error("Not logged in. Run `patiom login` first.");
    process.exit(1);
  }
};

export const envSetCommand = async (keyValue: string) => {
  const eq = keyValue.indexOf("=");
  if (eq === -1) {
    consola.error("Invalid format. Usage: patiom env set KEY=VALUE");
    process.exit(1);
  }

  const key = keyValue.slice(0, eq);
  const value = keyValue.slice(eq + 1);
  const config = await readGlobalConfig();

  consola.start(`Setting ${key}...`);

  const response = await fetch(`${config.url}/env`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({ key, value }),
  });

  if (!response.ok) {
    const body = await response.text();
    consola.error(`Failed: ${response.status} ${body}`);
    process.exit(1);
  }

  consola.success(`${key} set.`);
};

export const envDeleteCommand = async (key: string) => {
  const config = await readGlobalConfig();

  consola.start(`Deleting ${key}...`);

  const response = await fetch(`${config.url}/env/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    consola.error(`Failed: ${response.status} ${body}`);
    process.exit(1);
  }

  consola.success(`${key} deleted.`);
};
