import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/env";

export const db = drizzle(postgres(env.DATABASE_URL as string), {
	schema,
});

export { schema };
