import { ofetch } from "ofetch";
import { consola } from "consola";
import { config } from "./config";

export const getGlobalConfig = () => {
  const url = config.get("url");
  const token = config.get("token");

  if (!url || !token) {
    consola.error("Not logged in. Run `patiom login` first.");
    process.exit(1);
  }

  return { url, token };
};

export const createApiClient = () => {
  const { url, token } = getGlobalConfig();

  return ofetch.create({
    baseURL: url,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    retry: 2,
    timeout: 30000,
  });
};
