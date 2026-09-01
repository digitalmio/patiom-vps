export type TimeRangePreset = "1h" | "24h" | "7d" | "30d";
export type TimeGranularity = "minute" | "hour" | "day";

export const TIME_RANGE_PRESETS: { value: TimeRangePreset; label: string }[] = [
	{ value: "1h", label: "Last hour" },
	{ value: "24h", label: "Last 24h" },
	{ value: "7d", label: "Last 7 days" },
	{ value: "30d", label: "Last 30 days" },
];

export function rangeFromPreset(preset: TimeRangePreset): {
	from: Date;
	to: Date;
} {
	const to = new Date();
	const from = new Date();
	switch (preset) {
		case "1h":
			from.setHours(from.getHours() - 1);
			break;
		case "24h":
			from.setHours(from.getHours() - 24);
			break;
		case "7d":
			from.setDate(from.getDate() - 7);
			break;
		case "30d":
			from.setDate(from.getDate() - 30);
			break;
	}
	return { from, to };
}

/** Sensible chart bucket size for a preset: minutes for 1h, hours for 24h, days beyond. */
export function defaultGranularity(preset: TimeRangePreset): TimeGranularity {
	switch (preset) {
		case "1h":
			return "minute";
		case "24h":
			return "hour";
		default:
			return "day";
	}
}
