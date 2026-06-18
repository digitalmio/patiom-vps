import { createMiddleware } from "hono/factory";
import { validateToken, type Token } from "../core/tokens";

declare module "hono" {
  interface ContextVariableMap {
    token: Token;
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const tokenData = await validateToken(token);

  if (!tokenData) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("token", tokenData);
  await next();
});
