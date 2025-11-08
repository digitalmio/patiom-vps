import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authClient } from "@/lib/auth/client";

export type UserNotLoggedIn = {
	id: undefined;
	name: undefined;
	email: undefined;
	image?: undefined;
};

export type UserLoggedIn = {
	id: string;
	name: string;
	email: string;
	image: string | undefined;
};

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
			} as UserNotLoggedIn | UserLoggedIn,
		},
	});
});

export const isAuthenticatedMiddleware = createMiddleware()
	.middleware([authMiddleware])
	.server(async ({ context, next }) => {
		if (!context.user?.id) {
			throw new Error("User is not authenticated");
		}

		return await next({
			context: {
				user: context.user,
			},
		});
	});
