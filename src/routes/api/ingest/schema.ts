import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { validateToken } from "@/lib/db/queries";
import { schemaQueue } from "@/lib/redis";

export const Route = createFileRoute("/api/ingest/schema")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const token = request.headers.get("Patiom-Schema-Token");
				if (!token) {
					return json({ error: "Unauthorized" }, { status: 401 });
				}

				const { isValidToken } = await validateToken(token, "schema");
				if (!isValidToken) {
					return json({ error: "Unauthorized" }, { status: 401 });
				}

				// add data to the queue
				await schemaQueue.add("schema-ingestion", await request.json());

				return json({ status: "Schema successfully received" });
			},
		},
	},
});
