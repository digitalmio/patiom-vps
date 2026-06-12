import { consola } from "consola";
import cac from "cac";
import { loginCommand } from "./commands/login";
import { initCommand } from "./commands/init";
import { deployCommand } from "./commands/deploy";
import pkg from "../package.json" with { type: "json" };

consola.options.formatOptions = { date: false };

const cli = cac("patiom");

cli.command("login", "Link your local machine to the Patiom daemon").action(loginCommand);

cli.command("init", "Bootstrap a new Patiom project").action(initCommand);

cli
	.command("deploy", "Build, zip, and upload your application")
	.option("--prod", "Deploy to production (default)", { default: true })
	.option("--dry-run", "Build and zip locally without uploading", {
		default: false,
	})
	.action(deployCommand);

cli.help();
cli.version(pkg.version);

cli.parse();
