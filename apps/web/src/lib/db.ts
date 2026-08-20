import { createDb } from "@patiom/db";
import { env } from "@/env";

export const db = createDb(env.DATABASE_URL, env.DATABASE_LOGGER);

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
