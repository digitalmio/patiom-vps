import fs from "node:fs/promises";
import { parse, stringify } from "smol-toml";

const CONFIG_PATH = "/etc/rpxy/config.toml";

export type RpxyUpstream = {
  location: string;
};

export type RpxyReverseProxy = {
  upstream: RpxyUpstream[];
  load_balance?: string;
};

export type RpxyAppConfig = {
  server_name: string;
  tls?: { https_redirection: boolean; acme: boolean };
  reverse_proxy: RpxyReverseProxy[];
};

export type RpxyAcmeConfig = {
  dir_url: string;
  email: string;
  registry_path: string;
};

export type RpxyConfig = {
  listen_port: number;
  listen_port_tls: number;
  experimental: {
    acme: RpxyAcmeConfig;
  };
  apps: Record<string, RpxyAppConfig>;
};

let configWriteQueue: Promise<void> = Promise.resolve();

const writeConfigAtomic = async (config: RpxyConfig): Promise<void> => {
  const toml = stringify(config);
  const tmpPath = `${CONFIG_PATH}.tmp`;
  await fs.writeFile(tmpPath, toml);
  await fs.rename(tmpPath, CONFIG_PATH);
};

export const readConfig = async (): Promise<RpxyConfig> => {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  return parse(raw) as RpxyConfig;
};

export const writeConfig = async (config: RpxyConfig): Promise<void> => {
  await writeConfigAtomic(config);
};

export const addApp = async (
  appName: string,
  serverName: string,
  ports: number[]
): Promise<void> => {
  const next = configWriteQueue.then(async () => {
    const config = await readConfig();

    const upstreams = ports.map((port) => ({
      location: `127.0.0.1:${port}`,
    }));

    config.apps[appName] = {
      server_name: serverName,
      tls: { https_redirection: true, acme: true },
      reverse_proxy: [
        {
          upstream: upstreams,
          load_balance: "round_robin",
        },
      ],
    };

    await writeConfigAtomic(config);
  });
  configWriteQueue = next.catch(() => {});
  await next;
};

export const removeApp = async (appName: string): Promise<void> => {
  const next = configWriteQueue.then(async () => {
    const config = await readConfig();
    const prefix = `${appName}-`;
    config.apps = Object.fromEntries(
      Object.entries(config.apps).filter(
        ([key]) => key !== appName && !key.startsWith(prefix)
      )
    );
    await writeConfigAtomic(config);
  });
  configWriteQueue = next.catch(() => {});
  await next;
};

export const createAcmeConfig = (email: string): RpxyConfig => {
  return {
    listen_port: 80,
    listen_port_tls: 443,
    experimental: {
      acme: {
        dir_url: "https://acme-v02.api.letsencrypt.org/directory",
        email: email,
        registry_path: "/var/lib/patiom/acme_registry",
      },
    },
    apps: {},
  };
};
