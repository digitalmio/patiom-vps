import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Cache of IP -> geolocation lookups so the logs worker only calls the
// external geo API once per unique IP per TTL window. Results are stable for
// days, so a short-lived DB cache removes the need for a bundled geo database.
export const ipGeoCache = pgTable("ip_geo_cache", {
	ip: text("ip").primaryKey(),
	countryCode: varchar("country_code", { length: 2 }),
	countryName: varchar("country_name", { length: 100 }),
	city: varchar("city", { length: 100 }),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
	expiresAt: timestamp("expires_at").notNull(),
});
