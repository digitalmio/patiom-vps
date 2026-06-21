import { consola } from "consola";
import { program } from "commander";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import pkg from "../package.json" with { type: "json" };
import { startServer } from "./server";
import { runSetup } from "./setup";
import { restart } from "./core/systemd";

consola.options.formatOptions = { date: false };

const skipRootOpt = "--devSkipRootCheck";

const checkRoot = (skip?: boolean) => {
  if (skip) return;
  if (process.getuid?.() !== 0) {
    consola.error(
      "This command must be run as root. Try: sudo patiom-server <command>",
    );
    process.exit(1);
  }
};

program
  .name("patiom-server")
  .description("Patiom daemon — bare-metal deployment server");

program
  .command("serve")
  .description("Start the daemon HTTP server")
  .option(skipRootOpt, "Skip root check for development")
  .action((options) => {
    checkRoot(options.devSkipRootCheck);
    startServer();
  });

program
  .command("setup")
  .description("First-time server setup")
  .requiredOption("--email <email>", "Email for Let's Encrypt certificates")
  .option(skipRootOpt, "Skip root check for development")
  .action((options) => {
    checkRoot(options.devSkipRootCheck);
    if (!/^\S+@\S+\.\S+$/u.test(options.email)) {
      consola.error("Invalid email format. Provide a valid email for Let's Encrypt certificates.");
      process.exit(1);
    }
    return runSetup(options.email);
  });

program
  .command("upgrade")
  .description("Update the daemon package and restart the service")
  .option(skipRootOpt, "Skip root check for development")
  .action(async (options) => {
    checkRoot(options.devSkipRootCheck);
    consola.info(`Current version: ${pkg.version}`);

    let latest: string | null = null;
    try {
      const { stdout } = await execa("npm", [
        "view",
        "@patiom/daemon",
        "version",
      ]);
      latest = stdout.trim();
    } catch {
      consola.warn("Could not check npm registry, proceeding with update...");
    }

    if (latest && latest === pkg.version) {
      consola.success("Already up to date");
      return;
    }

    if (latest) {
      consola.info(`Latest version: ${latest}`);
    }

    consola.start("Updating @patiom/daemon...");
    await execa("npm", ["uninstall", "-g", "@patiom/daemon"]);
    await execa("npm", ["install", "-g", "@patiom/daemon@latest"]);
    const pkgPath = path.resolve(import.meta.dirname, "..", "package.json");
    const newVersion = JSON.parse(readFileSync(pkgPath, "utf-8")).version;
    consola.success(`Updated to ${newVersion}`);
    consola.start("Restarting patiom-daemon service...");
    await restart("patiom-daemon");
    consola.success("Daemon restarted");
  });

program.version(pkg.version);
program.parse();
