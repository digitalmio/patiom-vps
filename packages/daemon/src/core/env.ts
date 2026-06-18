import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { getSharedDir } from "./releases";

export type Logger = (msg: string) => void;

const envWriteQueues = new Map<string, Promise<void>>();

const getEnvWriteQueue = (appName: string): Promise<void> => {
  return envWriteQueues.get(appName) ?? Promise.resolve();
};

const setEnvWriteQueue = (appName: string, queue: Promise<void>): void => {
  envWriteQueues.set(appName, queue);
};

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

const writeEnvAtomic = async (envPath: string, content: string): Promise<void> => {
  const tmpPath = `${envPath}.tmp`;
  await fs.writeFile(tmpPath, content, { mode: 0o600 });
  await fs.rename(tmpPath, envPath);
};

export const setEnv = async (
  appName: string,
  key: string,
  value: string,
  log: Logger
): Promise<void> => {
  const envPath = getEnvPath(appName);

  const prev = getEnvWriteQueue(appName);
  const next = prev.then(async () => {
    const env = await parseEnv(envPath);
    env[key] = value;
    await writeEnvAtomic(envPath, serializeEnv(env));
    log(`Set ${key} in .env`);
  });
  setEnvWriteQueue(appName, next.catch(() => {}));
  await next;
};

export const deleteEnv = async (
  appName: string,
  key: string,
  log: Logger
): Promise<void> => {
  const envPath = getEnvPath(appName);

  const prev = getEnvWriteQueue(appName);
  const next = prev.then(async () => {
    const env = await parseEnv(envPath);
    delete env[key];
    await writeEnvAtomic(envPath, serializeEnv(env));
    log(`Deleted ${key} from .env`);
  });
  setEnvWriteQueue(appName, next.catch(() => {}));
  await next;
};
