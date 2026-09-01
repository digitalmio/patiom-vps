import { defineConfig } from "vitest/config";

// Deliberately minimal: no Cloudflare plugin (vitest has no worker bindings),
// unit tests run in plain node. Integration coverage lives in the Workers.
export default defineConfig({
	test: {
		environment: "node",
		passWithNoTests: true,
	},
});
