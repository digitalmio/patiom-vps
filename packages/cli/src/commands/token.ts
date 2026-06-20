import { consola } from "consola";
import { createApiClient } from "../core/api";

export type TokenCreateOptions = {
  name: string;
  scope: string;
};

export const tokenCreateCommand = async (options: TokenCreateOptions) => {
  const api = await createApiClient();

  consola.start(`Creating token "${options.name}" with scope "${options.scope}"...`);

  try {
    const result = await api<{ token: string; warning: string }>("/tokens", {
      method: "POST",
      body: { name: options.name, scope: options.scope },
    });

    console.log("");
    consola.success("Token created!");
    console.log("");
    console.log(`  Token: ${result.token}`);
    console.log("");
    consola.warn(result.warning);
    console.log("");
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};

export const tokenListCommand = async () => {
  const api = await createApiClient();

  try {
    const tokens = await api<Array<{ id: string; name: string; scope: string; createdAt: string; last8: string }>>("/tokens");

    if (tokens.length === 0) {
      consola.info("No tokens found. Your master token should appear here after `patiom-server setup`.");
      return;
    }

    console.log("");
    console.log("  Tokens:");
    console.log("");

    tokens.forEach((token) => {
      const date = new Date(token.createdAt).toLocaleDateString();
      console.log(`  ${token.name} | ${token.scope} | ${date} | ••••${token.last8}`);
    });

    console.log("");
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};

export const tokenRevokeCommand = async (id: string) => {
  const api = await createApiClient();

  consola.start(`Revoking token ${id}...`);

  try {
    await api(`/tokens/${id}`, {
      method: "DELETE",
    });
    consola.success(`Token ${id} revoked.`);
  } catch (error) {
    consola.error(`Failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};
