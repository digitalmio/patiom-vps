import { Hono } from "hono";
import pkg from "../../package.json" with { type: "json" };
import { getServiceState, getServiceLogs, getListeningPorts } from "../core/diagnostics";

export const statusRoute = new Hono();

statusRoute.get("/", async (c) => {
  const [rpxyState, rpxyLogs, ports] = await Promise.all([
    getServiceState("rpxy"),
    getServiceLogs("rpxy", 20),
    getListeningPorts(),
  ]);

  return c.json({
    daemon: {
      version: pkg.version,
      uptime: process.uptime(),
      port: Number(process.env.PORT) || 4000,
    },
    rpxy: { state: rpxyState, logs: rpxyLogs },
    ports,
  });
});
