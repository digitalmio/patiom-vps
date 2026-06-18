import fs from "node:fs/promises";
import path from "node:path";
import { createMiddleware } from "hono/factory";
import { PATIOM_ROOT } from "../config";

const AUDIT_LOG = path.join(PATIOM_ROOT, "audit.log");
// 10MB max size before rotation
const MAX_SIZE = 10 * 1024 * 1024;

const rotateIfNeeded = async (): Promise<void> => {
  try {
    const stat = await fs.stat(AUDIT_LOG);
    if (stat.size > MAX_SIZE) {
      await fs.rename(AUDIT_LOG, `${AUDIT_LOG}.1`);
    }
  } catch {
    // File doesn't exist, no rotation needed
  }
};

const writeAudit = async (line: string): Promise<void> => {
  await rotateIfNeeded();
  await fs.appendFile(AUDIT_LOG, `${line}\n`);
};

export const auditMiddleware = createMiddleware(async (c, next) => {
  await next();

  try {
    const token = c.get("token");
    const tokenDisplay = token ? token.name : "Unknown";
    const timestamp = new Date().toISOString();
    const method = c.req.method;
    const reqPath = c.req.path;
    const status = c.res.status;

    let line = `${timestamp} [${tokenDisplay}] ${method} ${reqPath} ${status}`;

    const releaseId = c.get("releaseId");
    if (releaseId) {
      line += ` releaseId=${releaseId}`;
    }

    await writeAudit(line);
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
});
