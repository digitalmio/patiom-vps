import { makeExecutableSchema } from "@graphql-tools/schema";
import { createPatiomAuth } from "@patiom/auth";
import { createDb } from "@patiom/db";
import { createYoga } from "graphql-yoga";
import {
	type ApiContext,
	type ApiEnv,
	type ApiServerContext,
	createContext,
} from "./context";
import { resolvers } from "./resolvers";
import { typeDefs } from "./schema";

const schema = makeExecutableSchema({ typeDefs, resolvers });

// biome-ignore lint/suspicious/noExplicitAny: Yoga's TServerContext must extend Record<string, any>; {} breaks the ctx spread, unknown breaks the ExecutionContext spread
type ApiYoga = ReturnType<typeof createYoga<Record<string, any>, ApiContext>>;

let yoga: ApiYoga | null = null;

function getYoga() {
	if (!yoga) {
		// biome-ignore lint/suspicious/noExplicitAny: same TServerContext constraint as above
		yoga = createYoga<Record<string, any>, ApiContext>({
			schema,
			context: createContext,
		});
	}
	return yoga;
}

export default {
	async fetch(request: Request, env: ApiEnv, ctx: ExecutionContext) {
		// Fresh DB connection per request: workerd freezes idle sockets between
		// events, so pooled connections go stale. Closed after the response via
		// waitUntil once all resolver queries have completed.
		const db = createDb(env.HYPERDRIVE.connectionString, false, {
			prepare: false,
			max: 5,
		});
		const auth = createPatiomAuth(db, {
			secret: env.BETTER_AUTH_SECRET,
			baseURL: env.BETTER_AUTH_URL,
		});

		const serverContext: ApiServerContext = { ...env, db, auth };
		const response = await getYoga().fetch(request, serverContext, ctx);
		ctx.waitUntil(db.$client.end().catch(() => {}));
		return response;
	},
};

export type { ApiContext };
