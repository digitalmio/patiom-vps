import pc from "picocolors";
import { consola } from "consola";
import { createApiClient } from "../core/api";
import { getAppName } from "../core/app";
import { formatBytes, printTable } from "../core/ui";

export const dbListCommand = async () => {
  const api = createApiClient();
  const appName = await getAppName();

  try {
    const dbs = await api<Array<{ name: string; sizeBytes: number }>>(`/db?appName=${encodeURIComponent(appName)}`);
    if (dbs.length === 0) {
      consola.info(`No databases found for ${appName}.`);
      return;
    }

    let rows: string[][];
    if (typeof dbs[0] === "string") {
      rows = (dbs as string[]).map((name) => [name, pc.dim("—")]);
    } else {
      rows = (dbs as Array<{ name: string; sizeBytes: number }>).map((db) => [db.name, formatBytes(db.sizeBytes)]);
    }
    printTable(["Database", "Size"], rows);
    console.log("");
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};

export const dbAddCommand = async (name: string) => {
  const api = createApiClient();
  const appName = await getAppName();

  consola.start(`Creating database ${name}...`);

  try {
    await api("/db", {
      method: "POST",
      body: { appName, name },
    });
    consola.success(`Database ${name} created.`);
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};

export const dbRemoveCommand = async (name: string) => {
  const api = createApiClient();
  const appName = await getAppName();

  consola.start(`Removing database ${name}...`);

  try {
    await api(`/db/${encodeURIComponent(name)}?appName=${encodeURIComponent(appName)}`, {
      method: "DELETE",
    });
    consola.success(`Database ${name} removed.`);
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};
