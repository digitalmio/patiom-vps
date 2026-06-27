import { consola } from "consola";
import { createApiClient } from "../core/api";
import { getAppName } from "../core/app";

export const envSetCommand = async (keyValue: string) => {
  const eq = keyValue.indexOf("=");
  if (eq === -1) {
    consola.error("Invalid format. Usage: patiom env set KEY=VALUE");
    process.exit(1);
  }

  const key = keyValue.slice(0, eq);
  const value = keyValue.slice(eq + 1);
  const api = createApiClient();
  const appName = await getAppName();

  consola.start(`Setting ${key}...`);

  try {
    await api("/env", {
      method: "POST",
      body: { appName, key, value },
    });
    consola.success(`${key} set.`);
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};

export const envDeleteCommand = async (key: string) => {
  const api = createApiClient();
  const appName = await getAppName();

  consola.start(`Deleting ${key}...`);

  try {
    await api(`/env/${encodeURIComponent(key)}?appName=${encodeURIComponent(appName)}`, {
      method: "DELETE",
    });
    consola.success(`${key} deleted.`);
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};
