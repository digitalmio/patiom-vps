import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Globe } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import {
	PaginationFooter,
	TableCard,
	Td,
	Th,
	Tr,
} from "@/components/admin/table";
import {
	rangeFromPreset,
	TIME_RANGE_PRESETS,
	type TimeRangePreset,
} from "@/lib/time-range";
import { cn } from "@/lib/utils";
import { projectLocations } from "@/services/analytics-sfn";

export const Route = createFileRoute("/dashboard/project/$projectId/locations")(
	{
		component: RouteComponent,
		staticData: {
			title: "Locations",
		},
		validateSearch: (search: Record<string, unknown>) => ({
			range: (search.range as TimeRangePreset) ?? ("7d" as const),
			groupBy: (search.groupBy as "country" | "city") ?? ("country" as const),
		}),
	},
);

const PAGE_SIZE = 25;

function RouteComponent() {
	const { projectId } = Route.useParams();
	const { range, groupBy } = Route.useSearch();
	const navigate = Route.useNavigate();

	const { from, to } = rangeFromPreset(range);

	const locationsQuery = useQuery({
		queryKey: ["project-locations", projectId, range, groupBy],
		queryFn: () =>
			projectLocations({ data: { projectId, groupBy, from, to, limit: 200 } }),
	});

	const rows = useMemo(
		() =>
			(locationsQuery.data ?? []).map((row) => ({
				...row,
				errorRatePct:
					row.totalRequests > 0
						? (row.errorCount / row.totalRequests) * 100
						: null,
				sharePct:
					row.totalAllRequests > 0
						? (row.totalRequests / row.totalAllRequests) * 100
						: null,
			})),
		[locationsQuery.data],
	);

	const pageRows = rows.slice(0, PAGE_SIZE);
	const loading = locationsQuery.isPending;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Locations"
				description="Where your GraphQL traffic comes from, resolved from visitor IPs."
			>
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-1 rounded-xl border bg-card p-1">
						{(["country", "city"] as const).map((group) => (
							<button
								key={group}
								type="button"
								onClick={() =>
									navigate({
										search: (prev) => ({ ...prev, groupBy: group }),
									})
								}
								className={cn(
									"rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
									groupBy === group
										? "bg-charcoal-900 text-white"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{group}
							</button>
						))}
					</div>
					<div className="flex items-center gap-1 rounded-xl border bg-card p-1">
						{TIME_RANGE_PRESETS.map((preset) => (
							<button
								key={preset.value}
								type="button"
								onClick={() =>
									navigate({
										search: (prev) => ({ ...prev, range: preset.value }),
									})
								}
								className={cn(
									"rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
									range === preset.value
										? "bg-charcoal-900 text-white"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{preset.label}
							</button>
						))}
					</div>
				</div>
			</PageHeader>

			<TableCard
				footer={
					<PaginationFooter
						from={rows.length === 0 ? 0 : 1}
						to={pageRows.length}
						total={rows.length}
					/>
				}
			>
				<table className="w-full">
					<thead>
						<tr>
							<Th>{groupBy === "city" ? "City" : "Country"}</Th>
							<Th className="text-right">Requests</Th>
							<Th className="text-right">Share</Th>
							<Th className="text-right">Avg (ms)</Th>
							<Th className="text-right">p95 (ms)</Th>
							<Th className="text-right">Errors</Th>
						</tr>
					</thead>
					<tbody>
						{pageRows.map((row, index) => {
							const key = `${row.countryCode ?? "--"}:${row.city ?? "-"}:${index}`;
							return (
								<Tr key={key}>
									<Td>
										<div className="flex items-center gap-2">
											{row.countryCode && (
												<span className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
													{row.countryCode}
												</span>
											)}
											<span className="font-medium">
												{groupBy === "city"
													? (row.city ?? "Unknown city")
													: (row.countryName ?? "Unknown country")}
											</span>
										</div>
									</Td>
									<Td className="text-right tabular-nums">
										{row.totalRequests.toLocaleString()}
									</Td>
									<Td className="text-muted-foreground text-right tabular-nums">
										{row.sharePct == null ? "—" : `${row.sharePct.toFixed(1)}%`}
									</Td>
									<Td className="text-muted-foreground text-right tabular-nums">
										{row.avgLatencyMs == null
											? "—"
											: row.avgLatencyMs.toFixed(1)}
									</Td>
									<Td className="text-right tabular-nums">
										{row.p95LatencyMs == null
											? "—"
											: row.p95LatencyMs.toFixed(1)}
									</Td>
									<Td
										className={cn(
											"text-right tabular-nums",
											row.errorCount > 0
												? "text-destructive font-medium"
												: "text-muted-foreground",
										)}
									>
										{row.errorCount}
									</Td>
								</Tr>
							);
						})}
						{pageRows.length === 0 && (
							<tr>
								<td colSpan={6}>
									<EmptyState
										icon={<Globe />}
										title={loading ? "Loading…" : "No location data"}
										description="Visitor locations are resolved from IP addresses at ingest time."
									/>
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</TableCard>
		</div>
	);
}
