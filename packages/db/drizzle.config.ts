import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/schema",
	// out: "./src/lib/db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
	},
	// Exclude TimescaleDB continuous aggregates and helper views
	tablesFilter: [
		"!operation_stats_hourly",
		"!operation_stats_daily",
		"!field_usage_stats_daily",
		"!recent_operations",
		"!error_logs",
	],
});
