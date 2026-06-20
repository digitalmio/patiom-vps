import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  format: "esm",
  platform: "node",
  target: "node20",
  dts: false,
  outDir: "dist",
  outputOptions: {
    banner: "#!/usr/bin/env node",
  },
  onSuccess: "chmod +x dist/index.js",
  deps: {
    neverBundle: ["esbuild"],
  },
});
