import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ulid } from "ulid";
import { PATIOM_ROOT } from "../config";

export type TokenScope = "master" | "rw" | "ro";

export type Token = {
  id: string;
  name: string;
  token: string;
  scope: TokenScope;
  createdAt: string;
};

export type TokensConfig = {
  tokens: Token[];
};

const TOKENS_FILE = path.join(PATIOM_ROOT, "tokens.json");

export const readTokens = async (): Promise<TokensConfig> => {
  try {
    const content = await fs.readFile(TOKENS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { tokens: [] };
  }
};

export const writeTokens = async (config: TokensConfig): Promise<void> => {
  await fs.writeFile(TOKENS_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
};

export const createToken = async (name: string, scope: TokenScope): Promise<Token> => {
  const config = await readTokens();
  const token: Token = {
    id: ulid(),
    name,
    token: crypto.randomBytes(16).toString("hex"),
    scope,
    createdAt: new Date().toISOString(),
  };

  config.tokens.push(token);
  await writeTokens(config);

  return token;
};

export const listTokens = async (): Promise<Array<Omit<Token, "token"> & { last8: string }>> => {
  const config = await readTokens();
  return config.tokens.map(({ token, ...rest }) => ({
    ...rest,
    last8: token.slice(-8),
  }));
};

export const revokeToken = async (
  id: string
): Promise<{ success: boolean; error?: string }> => {
  const config = await readTokens();
  const token = config.tokens.find((t) => t.id === id);

  if (!token) {
    return { success: false, error: "Token not found" };
  }

  if (token.scope === "master") {
    return { success: false, error: "Cannot revoke master token" };
  }

  config.tokens = config.tokens.filter((t) => t.id !== id);
  await writeTokens(config);
  return { success: true };
};

export const validateToken = async (token: string): Promise<Token | null> => {
  const config = await readTokens();
  return config.tokens.find((t) => t.token === token) ?? null;
};

export const hasScope = (tokenScope: TokenScope, requiredScope: TokenScope): boolean => {
  if (tokenScope === "master") return true;
  if (tokenScope === "rw" && requiredScope === "ro") return true;
  return tokenScope === requiredScope;
};
