import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { getSharedDir } from "./releases";

export type Logger = (msg: string) => void;

export const getEnvPath = (appName: string): string => {
  return path.join(getSharedDir(appName), ".env");
};

export const ensureEnvFile = async (
  appName: string,
  log: Logger
): Promise<void> => {
  const envPath = getEnvPath(appName);

  try {
    await fs.access(envPath);
  } catch {
    log(`Creating empty .env file: ${envPath}`);
    await fs.writeFile(envPath, "", { mode: 0o600 });
    log(".env file created");
  }
};

const parseEnv = async (envPath: string): Promise<Record<string, string>> => {
  const content = await fs.readFile(envPath, "utf-8");
  return dotenv.parse(content);
};

const serializeEnv = (env: Record<string, string>): string => {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
};

export const setEnv = async (
  appName: string,
  key: string,
  value: string,
  log: Logger
): Promise<void> => {
  const envPath = getEnvPath(appName);
  const env = await parseEnv(envPath);

  env[key] = value;
  await fs.writeFile(envPath, serializeEnv(env), { mode: 0o600 });

  log(`Set ${key} in .env`);
};

export const deleteEnv = async (
  appName: string,
  key: string,
  log: Logger
): Promise<void> => {
  const envPath = getEnvPath(appName);
  const env = await parseEnv(envPath);

  delete env[key];
  await fs.writeFile(envPath, serializeEnv(env), { mode: 0o600 });

  log(`Deleted ${key} from .env`);
};
