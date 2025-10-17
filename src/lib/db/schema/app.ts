import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const projects = pgTable("projects", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	description: text("description"),
	latestSchemaHash: text("latest_schema_hash").notNull(),
	ingestionSchemaKey: text("ingestion_schema_key").notNull(),
	ingestionLogKey: text("ingestion_log_key").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});
