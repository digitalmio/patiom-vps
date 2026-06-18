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
let tokensWriteQueue: Promise<void> = Promise.resolve();

const writeTokensAtomic = async (config: TokensConfig): Promise<void> => {
  const tmpPath = `${TOKENS_FILE}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  await fs.rename(tmpPath, TOKENS_FILE);
};

export const readTokens = async (): Promise<TokensConfig> => {
  try {
    const content = await fs.readFile(TOKENS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { tokens: [] };
  }
};

export const writeTokens = async (config: TokensConfig): Promise<void> => {
  await writeTokensAtomic(config);
};

export const createToken = async (name: string, scope: TokenScope): Promise<Token> => {
  const token: Token = {
    id: ulid(),
    name,
    token: crypto.randomBytes(16).toString("hex"),
    scope,
    createdAt: new Date().toISOString(),
  };

  const next = tokensWriteQueue.then(async () => {
    const config = await readTokens();
    config.tokens.push(token);
    await writeTokensAtomic(config);
  });
  tokensWriteQueue = next.catch(() => {});
  await next;

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
  let result: { success: boolean; error?: string } = { success: false, error: "Token not found" };

  const next = tokensWriteQueue.then(async () => {
    const config = await readTokens();
    const token = config.tokens.find((t) => t.id === id);

    if (!token) {
      result = { success: false, error: "Token not found" };
      return;
    }

    if (token.scope === "master") {
      result = { success: false, error: "Cannot revoke master token" };
      return;
    }

    config.tokens = config.tokens.filter((t) => t.id !== id);
    await writeTokensAtomic(config);
    result = { success: true };
  });
  tokensWriteQueue = next.catch(() => {});
  await next;

  return result;
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
