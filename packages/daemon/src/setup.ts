import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { confirm, input, select } from "@inquirer/prompts";
import { consola } from "consola";
import { execa } from "execa";
import { PATIOM_ROOT } from "./config";
import { createAcmeConfig, writeConfig } from "./core/proxy";
import { daemonReload, enable, start } from "./core/systemd";
import { rpxyServiceTemplate, daemonServiceTemplate } from "./templates/systemd";

const DAEMON_PORT = 4000;
const DAEMON_BIN_PATH = "/usr/local/bin/patiom-server";

const checkRoot = () => {
  if (process.getuid?.() !== 0) {
    consola.error("This script must be run as root. Try: sudo patiom-server setup");
    process.exit(1);
  }
};

const detectOS = async (): Promise<string> => {
  try {
    const content = await fs.readFile("/etc/os-release", "utf-8");
    const match = content.match(/^ID=(.+)$/mu);
    return match?.[1]?.trim() ?? "unknown";
  } catch {
    return "unknown";
  }
};

const detectIP = async (): Promise<string> => {
  try {
    const { stdout } = await execa("curl", ["-s", "https://api.ipify.org"]);
    return stdout.trim();
  } catch {
    consola.warn("Could not detect public IP");
    return "unknown";
  }
};

const detectFnmBinPath = async (): Promise<string> => {
  try {
    const { stdout } = await execa("which", ["node"]);
    return path.dirname(stdout.trim());
  } catch {
    consola.error("Node.js not found. Run setup.sh first.");
    process.exit(1);
  }
};

const configureFirewall = async (os: string, port: number) => {
  const shouldConfigure = await confirm({
    message: "Configure firewall?",
    default: true,
  });

  if (!shouldConfigure) {
    consola.info("Skipping firewall configuration");
    return;
  }

  if (os === "ubuntu" || os === "debian") {
    consola.start("Configuring UFW...");
    await execa("ufw", ["default", "deny", "incoming"]);
    await execa("ufw", ["default", "allow", "outgoing"]);
    await execa("ufw", ["allow", "22/tcp"]);
    await execa("ufw", ["allow", "80/tcp"]);
    await execa("ufw", ["allow", "443/tcp"]);
    await execa("ufw", ["allow", `${port}/tcp`]);
    await execa("ufw", ["--force", "enable"]);
    consola.success("UFW configured");
  } else if (["almalinux", "rocky", "centos", "fedora", "rhel"].includes(os)) {
    consola.start("Configuring Firewalld...");
    await execa("systemctl", ["enable", "--now", "firewalld"]);
    await execa("firewall-cmd", ["--permanent", "--zone=public", "--add-port=22/tcp"]);
    await execa("firewall-cmd", ["--permanent", "--zone=public", "--add-port=80/tcp"]);
    await execa("firewall-cmd", ["--permanent", "--zone=public", "--add-port=443/tcp"]);
    await execa("firewall-cmd", ["--permanent", "--zone=public", "--add-port", `${port}/tcp`]);
    await execa("firewall-cmd", ["--reload"]);
    await execa("setsebool", ["-P", "httpd_can_network_connect", "1"]);
    consola.success("Firewalld configured");
  } else {
    consola.warn(`Unsupported OS for firewall: ${os}`);
  }
};

const configureACME = async (): Promise<{ useRelay: boolean; email?: string }> => {
  const choice = await select({
    message: "SSL certificate provider:",
    choices: [
      { name: "Patiom ACME relay (free, recommended)", value: "relay" },
      { name: "Direct Let's Encrypt", value: "letsencrypt" },
    ],
  });

  if (choice === "relay") {
    return { useRelay: true };
  }

  const email = await input({
    message: "Email for Let's Encrypt:",
    validate: (v) => (v.includes("@") ? true : "Please enter a valid email"),
  });

  return { useRelay: false, email };
};

const setupPatiomDirs = async () => {
  await fs.mkdir(PATIOM_ROOT, { recursive: true });
  await fs.mkdir(path.join(PATIOM_ROOT, "apps"), { recursive: true });
};

const generateToken = async (): Promise<string> => {
  const token = crypto.randomBytes(16).toString("hex");
  const tokenPath = path.join(PATIOM_ROOT, "token");
  await fs.writeFile(tokenPath, token, { mode: 0o600 });
  return token;
};

const writeIP = async (ip: string) => {
  const ipPath = path.join(PATIOM_ROOT, "ip");
  await fs.writeFile(ipPath, ip);
};

const writeSystemdUnit = async (name: string, content: string) => {
  const unitPath = `/etc/systemd/system/${name}.service`;
  await fs.writeFile(unitPath, content);
};

const installServices = async (fnmBinPath: string) => {
  const rpxyUnit = rpxyServiceTemplate({ rpxyBinPath: "/usr/local/bin/rpxy" });
  await writeSystemdUnit("rpxy", rpxyUnit);

  const daemonUnit = daemonServiceTemplate({
    fnmBinPath,
    daemonBinPath: DAEMON_BIN_PATH,
    port: DAEMON_PORT,
  });
  await writeSystemdUnit("patiom-daemon", daemonUnit);

  await daemonReload();
  await enable("rpxy");
  await start("rpxy");
  consola.success("rpxy started");

  await enable("patiom-daemon");
  await start("patiom-daemon");
  consola.success("Patiom daemon started");
};

const setup = async () => {
  console.log("");
  consola.info("Patiom Server Setup");
  console.log("");

  checkRoot();

  const os = await detectOS();
  consola.info(`Detected OS: ${os}`);

  if (os === "unknown") {
    consola.error("Unsupported OS. Please use Ubuntu, Debian, AlmaLinux, Rocky, CentOS, Fedora, or RHEL.");
    process.exit(1);
  }

  const fnmBinPath = await detectFnmBinPath();

  await configureFirewall(os, DAEMON_PORT);

  console.log("");
  const { useRelay, email } = await configureACME();

  console.log("");
  consola.start("Setting up Patiom...");

  await setupPatiomDirs();

  const token = await generateToken();
  consola.success("Auth token generated");

  const ip = await detectIP();
  await writeIP(ip);
  consola.success(`Public IP: ${ip}`);

  const acmeConfig = createAcmeConfig(useRelay, email);
  await writeConfig(acmeConfig);
  consola.success("rpxy config written");

  await installServices(fnmBinPath);

  console.log("");
  consola.success("Patiom server setup complete!");
  console.log("");
  console.log(`Auth token: ${token}`);
  console.log("");
  consola.info("Next steps:");
  console.log(`  patiom login --url http://${ip}:${DAEMON_PORT} --token ${token}`);
  console.log("");
};

try {
  await setup();
} catch (err) {
  consola.error("Setup failed:", err);
  process.exit(1);
}
