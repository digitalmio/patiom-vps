import { createAuthClient } from "better-auth/client";
import { apiKeyClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
	plugins: [apiKeyClient()],
	baseURL: "http://localhost:3000",
});
