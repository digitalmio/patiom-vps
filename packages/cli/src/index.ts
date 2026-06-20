import { consola } from "consola";
import cac from "cac";
import { loginCommand } from "./commands/login";
import { initCommand } from "./commands/init";
import { deployCommand } from "./commands/deploy";
import { envSetCommand, envDeleteCommand } from "./commands/env";
import { dbListCommand, dbAddCommand, dbRemoveCommand } from "./commands/db";
import { tokenCreateCommand, tokenListCommand, tokenRevokeCommand } from "./commands/token";
import pkg from "../package.json" with { type: "json" };

consola.options.formatOptions = { date: false };

const cli = cac("patiom");

cli
  .command("login", "Link your local machine to the Patiom daemon")
  .option("--url <url>", "Daemon API URL")
  .option("--token <token>", "Auth token")
  .action((options) => loginCommand(options));

cli.command("init", "Bootstrap a new Patiom project").action(initCommand);

cli
  .command("deploy", "Build, zip, and upload your application")
  .option("--prod", "Deploy to production (default)", { default: true })
  .option("--dry-run", "Build and zip locally without uploading", {
    default: false,
  })
  .action(deployCommand);

cli
  .command("env set <keyValue>", "Set an environment variable (e.g. KEY=VALUE)")
  .action((keyValue) => envSetCommand(keyValue));

cli
  .command("env delete <key>", "Delete an environment variable")
  .action((key) => envDeleteCommand(key));

cli
  .command("db list", "List databases")
  .action(() => dbListCommand());

cli
  .command("db add <name>", "Create a new database")
  .action((name) => dbAddCommand(name));

cli
  .command("db remove <name>", "Remove a database")
  .action((name) => dbRemoveCommand(name));

cli
  .command("token create", "Create a new token")
  .option("--name <name>", "Token name", { default: "Unnamed" })
  .option("--scope <scope>", "Token scope (rw or ro)", { default: "rw" })
  .action((options) => tokenCreateCommand(options));

cli
  .command("token list", "List all tokens")
  .action(() => tokenListCommand());

cli
  .command("token revoke <id>", "Revoke a token")
  .action((id) => tokenRevokeCommand(id));

cli.help();
cli.version(pkg.version);

cli.parse();
