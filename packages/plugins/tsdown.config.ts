import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: "src/index.ts",
		platform: "node",
		dts: true,
		format: ["cjs", "esm"],
		external: ["graphql"],
	},
	{
		entry: "src/apollo.ts",
		platform: "node",
		dts: true,
		format: ["cjs", "esm"],
		external: ["graphql"],
	},
	{
		entry: "src/envelop.ts",
		platform: "node",
		dts: true,
		format: ["cjs", "esm"],
		external: ["graphql", "@envelop/core"],
	},
	{
		entry: "src/graphql-yoga.ts",
		platform: "node",
		dts: true,
		format: ["cjs", "esm"],
		external: ["graphql", "graphql-yoga"],
	},
	{
		entry: "src/mercurius.ts",
		platform: "node",
		dts: true,
		format: ["cjs", "esm"],
		external: ["graphql", "fastify"],
	},
	{
		entry: "src/graphql-http.ts",
		platform: "node",
		dts: true,
		format: ["cjs", "esm"],
		external: ["graphql", "graphql-http"],
	},
]);
