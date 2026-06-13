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

export const dbListCommand = async () => {
  const config = await readGlobalConfig();

  const response = await fetch(`${config.url}/db`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    consola.error(`Failed: ${response.status} ${body}`);
    process.exit(1);
  }

  const dbs: string[] = await response.json();
  if (dbs.length === 0) {
    consola.info("No databases found.");
    return;
  }

  console.log("");
  for (const db of dbs) {
    console.log(`  ${db}`);
  }
  console.log("");
};

export const dbAddCommand = async (name: string) => {
  const config = await readGlobalConfig();

  consola.start(`Creating database ${name}...`);

  const response = await fetch(`${config.url}/db`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const body = await response.text();
    consola.error(`Failed: ${response.status} ${body}`);
    process.exit(1);
  }

  consola.success(`Database ${name} created.`);
};

export const dbRemoveCommand = async (name: string) => {
  const config = await readGlobalConfig();

  consola.start(`Removing database ${name}...`);

  const response = await fetch(`${config.url}/db/${encodeURIComponent(name)}`, {
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

  consola.success(`Database ${name} removed.`);
};
