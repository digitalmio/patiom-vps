import { consola } from "consola";
import { program } from "commander";
import { loginCommand } from "./commands/login";
import { initCommand } from "./commands/init";
import { deployCommand } from "./commands/deploy";
import { envSetCommand, envDeleteCommand } from "./commands/env";
import { dbListCommand, dbAddCommand, dbRemoveCommand } from "./commands/db";
import { tokenCreateCommand, tokenListCommand, tokenRevokeCommand } from "./commands/token";
import { statusCommand } from "./commands/status";
import { restartCommand } from "./commands/restart";
import pkg from "../package.json" with { type: "json" };

consola.options.formatOptions = { date: false };

program
	.name("patiom")
	.description("Radically simple, containerless, bare-metal deployment for Node.js");

program
	.command("login")
	.description("Link your local machine to the Patiom daemon")
	.option("--url <url>", "Daemon API URL")
	.option("--token <token>", "Auth token")
	.action((options) => loginCommand(options));

program
	.command("init")
	.description("Bootstrap a new Patiom project")
	.action(() => initCommand());

program
	.command("deploy")
	.description("Build, zip, and upload your application")
	.option("--prod", "Deploy to production (default)", true)
	.option("--dry-run", "Build and zip locally without uploading", false)
	.action((options) => deployCommand(options));

program
	.command("status")
	.description("Show server status or app details")
	.option("--app <name>", "Show status for a specific app")
	.option("--server", "Show server overview (daemon, rpxy, ports)")
	.option("--lines <n>", "Number of log lines per instance", (v) => parseInt(v, 10), 20)
	.action((options) => statusCommand(options));

program
	.command("restart [target]")
	.description("Restart a service (app name, 'rpxy', or 'daemon')")
	.action((target) => restartCommand(target));

const env = program
	.command("env")
	.description("Manage environment variables");

env
	.command("set <keyValue>")
	.description("Set an environment variable (e.g. KEY=VALUE)")
	.action((keyValue) => envSetCommand(keyValue));

env
	.command("delete <key>")
	.description("Delete an environment variable")
	.action((key) => envDeleteCommand(key));

const db = program
	.command("db")
	.description("Manage persistent database files");

db
	.command("list")
	.description("List databases")
	.action(() => dbListCommand());

db
	.command("add <name>")
	.description("Create a new database")
	.action((name) => dbAddCommand(name));

db
	.command("remove <name>")
	.description("Remove a database")
	.action((name) => dbRemoveCommand(name));

const token = program
	.command("token")
	.description("Manage auth tokens");

token
	.command("create")
	.description("Create a new token")
	.option("--name <name>", "Token name", "Unnamed")
	.option("--scope <scope>", "Token scope (rw or ro)", "rw")
	.action((options) => tokenCreateCommand(options));

token
	.command("list")
	.description("List all tokens")
	.action(() => tokenListCommand());

token
	.command("revoke <id>")
	.description("Revoke a token")
	.action((id) => tokenRevokeCommand(id));

program.version(pkg.version);
program.parse();
