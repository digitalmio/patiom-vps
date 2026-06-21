import { spawn } from "node:child_process";
import { Hono } from "hono";
import { requireScope } from "../middleware/scope";
import { restart } from "../core/systemd";

export const systemRoute = new Hono();

systemRoute.post("/rpxy/restart", requireScope("rw"), async (c) => {
  await restart("rpxy");
  return c.json({ success: true, message: "rpxy restarted" });
});

systemRoute.post("/daemon/restart", requireScope("rw"), (c) => {
  spawn("bash", ["-c", "sleep 1 && systemctl restart patiom-daemon"], {
    detached: true,
    stdio: "ignore",
  }).unref();

  return c.json({ success: true, message: "Daemon restarting..." });
});
