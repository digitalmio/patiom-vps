import { createPatiomAuth } from "@patiom/auth";
import { env } from "@/env";
import { db } from "@/lib/db";

export const auth = createPatiomAuth(db, {
	reactStartCookies: true,
	socialProviders: {
		github: {
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
		},
	},
});
