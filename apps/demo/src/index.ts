import { makeExecutableSchema } from "@graphql-tools/schema";
import { createPatiomYogaPlugin } from "@patiom/client/graphql-yoga";
import { createYoga } from "graphql-yoga";
import { resolvers } from "./resolvers";
import { typeDefs } from "./schema";

export type Env = {
	PATIOM_TOKEN?: string;
	PATIOM_ENDPOINT?: string;
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

let yoga: ReturnType<typeof createYoga> | null = null;

function getYoga(env: Env) {
	yoga ??= createYoga({
		schema,
		plugins: [
			createPatiomYogaPlugin({
				token: env.PATIOM_TOKEN ?? "",
				endpoint: env.PATIOM_ENDPOINT,
				fetch: globalThis.fetch,
			}),
		],
	});
	return yoga;
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return getYoga(env).fetch(request, env, ctx);
	},
};