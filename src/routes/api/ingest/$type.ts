import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { validateToken } from "@/lib/auth/queries";
import { logsQueue, schemaQueue } from "@/lib/redis";

type IngestType = "log" | "schema";

export const Route = createFileRoute("/api/ingest/$type")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				// allow only "log" or "schema" types
				if (params.type !== "logs" && params.type !== "schema") {
					throw json({ error: "Invalid type" }, { status: 400 });
				}

				// check if token is provided...
				const token = request.headers.get("Patiom-Schema-Token");
				if (!token) {
					return json({ error: "Unauthorized" }, { status: 401 });
				}

				// ...and if it's valid
				const { isValidToken, projectData } = await validateToken(
					token,
					params.type as IngestType,
				);
				if (!isValidToken || !projectData) {
					return json({ error: "Unauthorized" }, { status: 401 });
				}

				// all ok, now add data to the right queue
				const queue = params.type === "schema" ? schemaQueue : logsQueue;
				const data = {
					...(await request.json()),
					projectId: projectData.id,
					timestamp: new Date(),
				};
				await queue.add(`${params.type}Queue`, data);

				// and respond with success
				return json({
					status: `${params.type.charAt(0).toUpperCase() + params.type.slice(1)} successfully received`,
				});
			},
		},
	},
});
