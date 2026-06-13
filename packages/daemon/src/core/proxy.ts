import fs from "node:fs/promises";
import { parse, stringify } from "smol-toml";

const CONFIG_PATH = "/etc/rpxy/config.toml";

export type RpxyAcmeConfig = {
  dir_url: string;
  email: string;
  registry_path: string;
};

export type RpxyUpstream = {
  location: string;
  port: number;
};

export type RpxyApp = {
  host: string;
  path: string;
  upstream: RpxyUpstream;
};

export type RpxyConfig = {
  listen_port: number;
  listen_port_tls: number;
  experimental: {
    acme: RpxyAcmeConfig;
  };
  apps: RpxyApp[];
};

export const readConfig = async (): Promise<RpxyConfig> => {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  return parse(raw) as RpxyConfig;
};

export const writeConfig = async (config: RpxyConfig): Promise<void> => {
  const toml = stringify(config);
  await fs.writeFile(CONFIG_PATH, toml);
};

export const addApp = async (app: RpxyApp): Promise<void> => {
  const config = await readConfig();
  config.apps = config.apps.filter((a) => a.host !== app.host);
  config.apps.push(app);
  await writeConfig(config);
};

export const removeApp = async (host: string): Promise<void> => {
  const config = await readConfig();
  config.apps = config.apps.filter((a) => a.host !== host);
  await writeConfig(config);
};

export const createAcmeConfig = (useRelay: boolean, email?: string): RpxyConfig => {
  return {
    listen_port: 80,
    listen_port_tls: 443,
    experimental: {
      acme: {
        dir_url: useRelay
          ? "https://acme.patiom.dev/directory"
          : "https://acme-v02.api.letsencrypt.org/directory",
        email: useRelay ? "acme@patiom.dev" : email!,
        registry_path: "/var/lib/patiom/acme_registry",
      },
    },
    apps: [],
  };
};
