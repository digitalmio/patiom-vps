import { consola } from "consola";
import { createApiClient } from "../core/api";
import { getAppName } from "../core/app";

export const dbListCommand = async () => {
  const api = await createApiClient();
  const appName = await getAppName();

  try {
    const dbs = await api<string[]>(`/db?appName=${encodeURIComponent(appName)}`);
    if (dbs.length === 0) {
      consola.info("No databases found.");
      return;
    }

    console.log("");
    dbs.map((db) => console.log(`  ${db}`));
    console.log("");
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};

export const dbAddCommand = async (name: string) => {
  const api = await createApiClient();
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
  const api = await createApiClient();
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
