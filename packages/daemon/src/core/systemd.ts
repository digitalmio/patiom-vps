import { execa } from "execa";

export const daemonReload = () => execa("systemctl", ["daemon-reload"]);
export const enable = (name: string) => execa("systemctl", ["enable", name]);
export const start = (name: string) => execa("systemctl", ["start", name]);
export const stop = (name: string) => execa("systemctl", ["stop", name]);
export const restart = (name: string) => execa("systemctl", ["restart", name]);
export const status = (name: string) => execa("systemctl", ["status", name]);
