import { createMiddleware } from "hono/factory";
import { hasScope, type TokenScope } from "../core/tokens";

export const requireScope = (scope: TokenScope) => {
  return createMiddleware(async (c, next) => {
    const token = c.get("token");

    if (!hasScope(token.scope, scope)) {
      return c.json({ error: `Forbidden: requires ${scope} scope` }, 403);
    }

    await next();
  });
};
