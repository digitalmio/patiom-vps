import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  format: "esm",
  platform: "node",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  dts: false,
  outDir: "dist",
  deps: {
    neverBundle: ["esbuild"],
  },
});
