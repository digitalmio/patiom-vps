import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authClient } from "@/lib/auth/client";

export const authMiddleware = createMiddleware().server(async ({ next }) => {
	const req = getRequest();

	const { data: session } = await authClient.getSession({
		fetchOptions: {
			headers: req.headers as HeadersInit,
		},
	});

	return await next({
		context: {
			user: {
				id: session?.user?.id,
				name: session?.user?.name,
				email: session?.user?.email,
				image: session?.user?.image,
			},
		},
	});
});
