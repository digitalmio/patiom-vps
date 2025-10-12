import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth";

export const Route = createFileRoute("/api/ingest/schema")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const key = request.headers.get("Authorization");
				if (!key || (await auth.api.verifyApiKey({ body: { key } }))) {
					return new Response("Unauthorized", { status: 401 });
				}

				const body = await request.json();
				const { schema } = body;

				return new Response("Hello, POST!");
			},
		},
	},
});
