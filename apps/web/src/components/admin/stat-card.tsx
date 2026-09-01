import { SlidingNumber } from "@/components/nodus/sliding-number";
import { cn } from "@/lib/utils";

type StatCardProps = {
	label: string;
	value: number | null;
	/** Applied after the number, e.g. "%" or "ms" */
	suffix?: string;
	/** Applied before the number, e.g. "$" */
	prefix?: string;
	/** Change vs previous period, in percent */
	delta?: number | null;
	/** Whether a rising delta is a good thing (default true) */
	invertDelta?: boolean;
	decimals?: number;
	className?: string;
	loading?: boolean;
};

function formatDelta(delta: number) {
	return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

export function StatCard({
	label,
	value,
	suffix,
	prefix,
	delta,
	invertDelta = false,
	decimals = 0,
	className,
	loading = false,
}: StatCardProps) {
	const displayValue = value ?? 0;
	const scaledValue = displayValue * 10 ** decimals;
	const isGood = delta == null ? null : invertDelta ? delta <= 0 : delta >= 0;

	return (
		<div
			className={cn(
				"rounded-2xl border bg-card p-5 shadow-aceternity",
				className,
			)}
		>
			<p className="text-muted-foreground text-sm font-medium">{label}</p>
			{loading ? (
				<div className="bg-muted mt-2 h-9 w-24 animate-pulse rounded-md" />
			) : (
				<p className="mt-2 flex items-baseline gap-1 text-3xl font-semibold tracking-tight tabular-nums">
					{prefix}
					<SlidingNumber value={Number(scaledValue.toFixed(decimals))} />
					{suffix && (
						<span className="text-muted-foreground text-lg font-medium">
							{suffix}
						</span>
					)}
				</p>
			)}
			{delta != null && !loading && (
				<p
					className={cn(
						"mt-1 text-xs font-medium",
						isGood ? "text-brand" : "text-destructive",
					)}
				>
					{formatDelta(delta)}
					<span className="text-muted-foreground font-normal">
						{" "}
						vs previous period
					</span>
				</p>
			)}
		</div>
	);
}
