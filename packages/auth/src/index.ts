import type { Db } from "@patiom/db";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "better-auth/plugins";
import { reactStartCookies } from "better-auth/react-start";

export type PatiomAuthOptions = {
	/**
	 * Better Auth secret. In the web app it can be read from the
	 * `BETTER_AUTH_SECRET` env var; in Cloudflare Workers it must be passed
	 * explicitly from the worker's env bindings.
	 */
	secret?: string;
	/**
	 * The public base URL of the auth API (the web app).
	 */
	baseURL?: string;
	/**
	 * Enable the `reactStartCookies` plugin (web app only — handles TanStack
	 * Start cookie proxying).
	 */
	reactStartCookies?: boolean;
	socialProviders?: BetterAuthOptions["socialProviders"];
};

export function createPatiomAuth(db: Db, options: PatiomAuthOptions = {}) {
	return betterAuth({
		database: drizzleAdapter(db, { provider: "pg" }),
		plugins: [
			apiKey({ defaultPrefix: "ptk_", defaultKeyLength: 32 }),
			...(options.reactStartCookies ? [reactStartCookies()] : []),
		],
		...(options.secret ? { secret: options.secret } : {}),
		...(options.baseURL ? { baseURL: options.baseURL } : {}),
		...(options.socialProviders
			? { socialProviders: options.socialProviders }
			: {}),
	});
}

export type PatiomAuth = ReturnType<typeof createPatiomAuth>;
