import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { user } from "./auth";

export const projects = pgTable("projects", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => nanoid(10)),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	description: text("description"),
	ingestionToken: text("ingestion_schema_token")
		.unique()
		.notNull()
		.default(`ptm_${nanoid()}`),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});
