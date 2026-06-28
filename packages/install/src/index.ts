import { Hono } from "hono";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const app = new Hono();
app.use(logger());

app.get("/", (c) => c.redirect("https://github.com/digitalmio/patiom"));

app.get("/setup.sh", async (_c) => {
  const content = await readFile(
    join(import.meta.dirname, "setup.sh"),
    "utf-8",
  );
  return new Response(content, {
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 });
