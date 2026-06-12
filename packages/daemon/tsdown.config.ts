import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/server.ts",
  format: "esm",
  platform: "node",
  target: "node20",
  dts: false,
  outDir: "dist",
});
