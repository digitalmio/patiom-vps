import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { ulid } from "ulid";
import { APPS_DIR } from "../config";

export type Logger = (msg: string) => void;

export type ReleaseInfo = {
  id: string;
  path: string;
  createdAt: Date;
};

export const getAppDir = (appName: string): string => {
  return path.join(APPS_DIR, appName);
};

export const getReleasesDir = (appName: string): string => {
  return path.join(getAppDir(appName), "releases");
};

export const getSharedDir = (appName: string): string => {
  return path.join(getAppDir(appName), "shared");
};

export const getCurrentSymlink = (appName: string): string => {
  return path.join(getAppDir(appName), "current");
};

const generateReleaseId = (): string => {
  return ulid();
};

export const extractArchive = async (
  appName: string,
  archiveBuffer: Buffer,
  log: Logger
): Promise<string> => {
  const releaseId = generateReleaseId();
  const releasesDir = getReleasesDir(appName);
  const releaseDir = path.join(releasesDir, releaseId);

  log(`Creating release directory: ${releaseDir}`);
  await fs.mkdir(releaseDir, { recursive: true });

  log("Extracting archive...");
  const zip = new AdmZip(archiveBuffer);
  zip.extractAllTo(releaseDir, true);

  log(`Release ${releaseId} extracted successfully`);
  return releaseId;
};

export const createSymlinks = async (
  appName: string,
  releaseId: string,
  dbFolder: string,
  storageFolder: string,
  log: Logger
): Promise<void> => {
  const releaseDir = path.join(getReleasesDir(appName), releaseId);
  const sharedDir = getSharedDir(appName);

  const dbDir = path.join(sharedDir, dbFolder);
  const storageDir = path.join(sharedDir, storageFolder);

  log(`Ensuring shared directories exist: ${dbDir}, ${storageDir}`);
  await fs.mkdir(dbDir, { recursive: true });
  await fs.mkdir(storageDir, { recursive: true });

  const dbSymlink = path.join(releaseDir, dbFolder);
  const storageSymlink = path.join(releaseDir, storageFolder);

  log(`Creating symlink: ${dbSymlink} -> ${dbDir}`);
  await fs.symlink(dbDir, dbSymlink);

  log(`Creating symlink: ${storageSymlink} -> ${storageDir}`);
  await fs.symlink(storageDir, storageSymlink);
};

export const swapCurrentSymlink = async (
  appName: string,
  releaseId: string,
  log: Logger
): Promise<void> => {
  const releaseDir = path.join(getReleasesDir(appName), releaseId);
  const currentSymlink = getCurrentSymlink(appName);
  const tempSymlink = `${currentSymlink}.tmp`;

  log(`Swapping current symlink to ${releaseId}`);

  await fs.symlink(releaseDir, tempSymlink);
  await fs.rename(tempSymlink, currentSymlink);

  log("Current symlink swapped successfully");
};

export const listReleases = async (appName: string): Promise<ReleaseInfo[]> => {
  const releasesDir = getReleasesDir(appName);

  try {
    const entries = await fs.readdir(releasesDir);
    const entriesWithStats = await Promise.all(
      entries.map(async (entry) => {
        const releasePath = path.join(releasesDir, entry);
        const stat = await fs.stat(releasePath);
        return { entry, releasePath, stat };
      })
    );

    const releases = entriesWithStats
      .filter(({ stat }) => stat.isDirectory())
      .map(({ entry, releasePath, stat }) => ({
        id: entry,
        path: releasePath,
        createdAt: stat.birthtime,
      }));

    return releases.toSorted((a, b) => b.id.localeCompare(a.id));
  } catch {
    return [];
  }
};

export const getCurrentRelease = async (
  appName: string
): Promise<ReleaseInfo | null> => {
  const currentSymlink = getCurrentSymlink(appName);

  try {
    const target = await fs.readlink(currentSymlink);
    const id = path.basename(target);
    const stat = await fs.stat(target);

    return {
      id,
      path: target,
      createdAt: stat.birthtime,
    };
  } catch {
    return null;
  }
};

export const deleteRelease = async (
  appName: string,
  releaseId: string,
  log: Logger
): Promise<void> => {
  const releaseDir = path.join(getReleasesDir(appName), releaseId);

  log(`Deleting release: ${releaseId}`);
  await fs.rm(releaseDir, { recursive: true, force: true });

  log(`Release ${releaseId} deleted`);
};
