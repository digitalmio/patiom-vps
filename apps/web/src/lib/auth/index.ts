import { createPatiomAuth, type PatiomAuth } from "@patiom/auth";
import { env } from "@/env";
import { getDb } from "@/lib/db";
import { requestContext } from "@/lib/request-context";

export function getAuth(): PatiomAuth {
	const store = requestContext.getStore();
	if (!store?.env) {
		throw new Error("getAuth() called outside the request context");
	}
	store.auth ??= createPatiomAuth(getDb(), {
		reactStartCookies: true,
		socialProviders: {
			github: {
				clientId: env.GITHUB_CLIENT_ID,
				clientSecret: env.GITHUB_CLIENT_SECRET,
			},
		},
	});
	return store.auth;
}
