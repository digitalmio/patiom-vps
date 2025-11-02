import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

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
} from "drizzle-orm";

export const db = drizzle(postgres(env.DATABASE_URL as string), {
	schema,
	casing: "snake_case",
});

export { schema };
