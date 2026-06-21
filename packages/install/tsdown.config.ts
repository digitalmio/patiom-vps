import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  format: "esm",
  platform: "node",
  target: "node20",
  dts: false,
  outDir: "dist",
  onSuccess: "cp setup.sh dist/setup.sh",
});
