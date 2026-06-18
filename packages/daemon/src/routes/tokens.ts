import { Hono } from "hono";
import { createToken, listTokens, revokeToken, type TokenScope } from "../core/tokens";

export const tokensRoute = new Hono();

tokensRoute.post("/", async (c) => {
  const token = c.get("token");

  if (token.scope !== "master") {
    return c.json({ error: "Forbidden: master scope required" }, 403);
  }

  const body = await c.req.json();
  const { name, scope } = body;

  if (!name || !scope) {
    return c.json({ error: "Missing required fields: name, scope" }, 400);
  }

  if (!["rw", "ro"].includes(scope)) {
    return c.json({ error: "Invalid scope. Must be 'rw' or 'ro'" }, 400);
  }

  const newToken = await createToken(name, scope as TokenScope);

  return c.json({
    success: true,
    token: newToken.token,
    warning: "Save this token now. It will not be shown again.",
  });
});

tokensRoute.get("/", async (c) => {
  const token = c.get("token");

  if (token.scope !== "master") {
    return c.json({ error: "Forbidden: master scope required" }, 403);
  }

  const tokens = await listTokens();
  return c.json(tokens);
});

tokensRoute.delete("/:id", async (c) => {
  const token = c.get("token");

  if (token.scope !== "master") {
    return c.json({ error: "Forbidden: master scope required" }, 403);
  }

  const id = c.req.param("id");
  const result = await revokeToken(id);

  if (!result.success) {
    const status = result.error === "Token not found" ? 404 : 400;
    return c.json({ error: result.error }, status);
  }

  return c.json({ success: true });
});
