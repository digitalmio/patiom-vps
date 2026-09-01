import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "@patiom/db";
import type { PatiomAuth } from "@patiom/auth";

// workerd isolates I/O per request, so the Hyperdrive-backed DB client (and
// the better-auth instance bound to it) must live inside the request
// lifecycle, never in global script scope. The worker entry wraps the whole
// TanStack lifecycle in als.run() and server code lazily initializes via
// getDb()/getAuth().
export type RequestContext = {
	env: Env;
	db?: Db;
	auth?: PatiomAuth;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();
