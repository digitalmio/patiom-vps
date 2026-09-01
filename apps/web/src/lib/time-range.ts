export type TimeRangePreset = "24h" | "7d" | "30d";

export const TIME_RANGE_PRESETS: { value: TimeRangePreset; label: string }[] = [
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
