import { consola } from "consola";
import { createApiClient } from "../core/api";

export const dbListCommand = async () => {
  const api = await createApiClient();

  try {
    const dbs = await api<string[]>("/db");
    if (dbs.length === 0) {
      consola.info("No databases found.");
      return;
    }

    console.log("");
    for (const db of dbs) {
      console.log(`  ${db}`);
    }
    console.log("");
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};

export const dbAddCommand = async (name: string) => {
  const api = await createApiClient();

  consola.start(`Creating database ${name}...`);

  try {
    await api("/db", {
      method: "POST",
      body: { name },
    });
    consola.success(`Database ${name} created.`);
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};

export const dbRemoveCommand = async (name: string) => {
  const api = await createApiClient();

  consola.start(`Removing database ${name}...`);

  try {
    await api(`/db/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    consola.success(`Database ${name} removed.`);
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};
