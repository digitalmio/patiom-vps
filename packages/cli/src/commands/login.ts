import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { consola } from "consola";

const CONFIG_DIR = path.join(os.homedir(), ".patiom");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

type GlobalConfig = {
	url: string;
	token: string;
};

export const loginCommand = async () => {
	console.log("");
	consola.info("Link your local machine to the Patiom daemon");
	console.log("");

	const url = await consola.prompt("Daemon API URL (e.g. https://daemon.yourserver.com)", {
		type: "text",
	});

	const token = await consola.prompt("Auth token", { type: "text" });

	const config: GlobalConfig = { url: url as string, token: token as string };

	if (!config.url.trim() || !config.token.trim()) {
		consola.error("Daemon URL and auth token are required.");
		process.exit(1);
	}

	await fs.mkdir(CONFIG_DIR, { recursive: true });
	await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");

	console.log("");
	consola.success("Credentials saved to ~/.patiom/config.json");
	console.log("");
};
