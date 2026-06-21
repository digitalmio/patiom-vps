const SAFE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/u;
const RESERVED_NAMES = new Set(["rpxy", "daemon", "patiom", "patiom-server", "system", "status"]);

export const validateAppName = (name: string): void => {
  if (!name || !SAFE_NAME_PATTERN.test(name)) {
    throw new Error("Invalid app name. Use only letters, numbers, hyphens, underscores, and dots.");
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("Invalid app name. Path traversal characters are not allowed.");
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    throw new Error(`'${name}' is a reserved name and cannot be used as an app name.`);
  }
};

export const validateReleaseId = (releaseId: string): void => {
  if (!releaseId || !ULID_PATTERN.test(releaseId)) {
    throw new Error("Invalid release ID. Must be a 26-character ULID.");
  }
};

export const validateDbName = (name: string): void => {
  if (!name || !SAFE_NAME_PATTERN.test(name)) {
    throw new Error("Invalid database name. Use only letters, numbers, hyphens, underscores, and dots.");
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("Invalid database name. Path traversal characters are not allowed.");
  }
};

export const validateEnvKey = (key: string): void => {
  if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
    throw new Error("Invalid environment variable key. Must start with a letter or underscore and contain only letters, numbers, and underscores.");
  }
};
