import { consola } from "consola";
import { createApiClient } from "../core/api";
import { getAppName } from "../core/app";

export const restartCommand = async (target?: string) => {
  const api = createApiClient();

  if (target === "rpxy" || target === "daemon") {
    await api(`/system/${target}/restart`, { method: "POST" });
    consola.success(`${target} restart initiated`);
    return;
  }

  const appName = target ?? await getAppName();
  try {
    const result = await api(`/apps/${appName}/restart`, { method: "POST" });
    consola.success(`App '${appName}' restarted (ports: ${result.restarted.join(", ")})`);
  } catch (error) {
    consola.error(`Restart failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};
