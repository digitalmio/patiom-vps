import { consola } from "consola";
import { config } from "../core/config";

export const loginCommand = async (options?: { url?: string; token?: string }) => {
	console.log("");
	consola.info("Link your local machine to the Patiom daemon");
	console.log("");

	const url = options?.url ?? await consola.prompt(
		"Daemon API URL (e.g. http://YOUR_SERVER_IP:4000)",
		{
			type: "text",
		},
	);

	const token = options?.token ?? await consola.prompt("Auth token", { type: "text" });

	if (!url || !token) {
		consola.error("Daemon URL and auth token are required.");
		process.exit(1);
	}

	config.set("url", url);
	config.set("token", token);

	console.log("");
	consola.success(`Credentials saved to ${config.path}`);
	console.log("");
};
