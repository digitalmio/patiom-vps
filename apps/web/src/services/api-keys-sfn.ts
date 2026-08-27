import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isAuthenticatedMiddleware } from "./auth-middleware";

export const createProjectApiKey = createServerFn({ method: "POST" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(
		z.object({
			projectId: z.string(),
			name: z.string().optional(),
		}),
	)
	.handler(async ({ context, data }) => {
		return auth.api.createApiKey({
			body: {
				userId: context.user.id,
				name: data.name,
				metadata: { projectId: data.projectId },
				rateLimitEnabled: false,
			},
		});
	});

export const listProjectApiKeys = createServerFn({ method: "GET" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(z.object({ projectId: z.string() }))
	.handler(async ({ context, data }) => {
		const keys = await auth.api.listApiKeys({
			query: { userId: context.user.id },
		});
		return keys.filter(
			(key) =>
				(key.metadata as { projectId?: string } | null)?.projectId ===
				data.projectId,
		);
	});

export const deleteProjectApiKey = createServerFn({ method: "POST" })
	.middleware([isAuthenticatedMiddleware])
	.inputValidator(z.object({ keyId: z.string() }))
	.handler(async ({ data }) => {
		return auth.api.deleteApiKey({ body: { keyId: data.keyId } });
	});
