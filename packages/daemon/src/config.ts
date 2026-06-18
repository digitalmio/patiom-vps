import path from "node:path";

export const PATIOM_ROOT = "/var/lib/patiom";

export const APPS_DIR = path.join(PATIOM_ROOT, "apps");
export const IP_FILE = path.join(PATIOM_ROOT, "ip");

export const PORT_MIN = 50000;
export const PORT_MAX = 51000;

export const DEFAULT_INSTANCES = 1;
export const DEFAULT_DB_FOLDER = "db";
export const DEFAULT_STORAGE_FOLDER = "storage";
export const DEFAULT_SSLIP_DOMAIN = true;
