import { env as cfEnv } from "cloudflare:workers";
import { createDb, type Db } from "@patiom/db";
import { requestContext } from "@/lib/request-context";

// The Hyperdrive binding does not appear on process.env — read it from the
// runtime env (workerd). Locally the binding resolves via
// CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE (see scripts/dev).
function defaultDb(): Db {
	return createDb(
		cfEnv.HYPERDRIVE.connectionString,
		(cfEnv.DATABASE_LOGGER as string) === "true",
		{ prepare: false, max: 5 },
	);
}

export function getDb(): Db {
	const store = requestContext.getStore();
	if (!store?.env) {
		throw new Error("getDb() called outside the request context");
	}
	store.db ??= defaultDb();
	return store.db;
}

export {
	and,
	desc,
	eq,
	gt,
	gte,
	inArray,
	like,
	lt,
	lte,
	ne,
	schema,
} from "@patiom/db";
