import fs from "node:fs/promises";
import { createMiddleware } from "hono/factory";
import { TOKEN_FILE } from "../config";

let cachedToken: string | null = null;

const readToken = async (): Promise<string> => {
  if (cachedToken) return cachedToken;
  cachedToken = await fs.readFile(TOKEN_FILE, "utf-8");
  return cachedToken;
};

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const expectedToken = await readToken();

  if (token !== expectedToken.trim()) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});
