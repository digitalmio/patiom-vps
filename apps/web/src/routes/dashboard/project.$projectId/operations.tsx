import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { useMemo, useState } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import {
	PaginationFooter,
	TableCard,
	Td,
	Th,
	Tr,
} from "@/components/admin/table";
import {
	aggregateOperationsByOperation,
	totalsFromOperationStats,
} from "@/lib/operations-aggregate";
import {
	rangeFromPreset,
	TIME_RANGE_PRESETS,
	type TimeRangePreset,
} from "@/lib/time-range";
import { cn } from "@/lib/utils";
import { projectOperations } from "@/services/analytics-sfn";

export const Route = createFileRoute(
	"/dashboard/project/$projectId/operations",
)({
	component: RouteComponent,
	staticData: {
		title: "Operations",
	},
	validateSearch: (search: Record<string, unknown>) => ({
		range: (search.range as TimeRangePreset) ?? ("24h" as const),
		granularity: (search.granularity as "hour" | "day") ?? ("hour" as const),
	}),
});

type SortField = "totalRequests" | "p95LatencyMs" | "errorCount";
const PAGE_SIZE = 10;

function RouteComponent() {
	const { projectId } = Route.useParams();
	const { range, granularity } = Route.useSearch();
	const navigate = Route.useNavigate();

	const { from, to } = rangeFromPreset(range);
	const spanMs = to.getTime() - from.getTime();
	const prevFrom = new Date(from.getTime() - spanMs);

	const statsQuery = useQuery({
		queryKey: ["project-operations", projectId, granularity, range],
		queryFn: () =>
			projectOperations({ data: { projectId, granularity, from, to } }),
	});
	const prevQuery = useQuery({
		queryKey: ["project-operations-prev", projectId, granularity, range],
		queryFn: () =>
			projectOperations({
				data: { projectId, granularity, from: prevFrom, to: from },
			}),
	});

	const rows = statsQuery.data ?? [];
	const totals = useMemo(() => totalsFromOperationStats(rows), [rows]);
	const prevTotals = useMemo(
		() => totalsFromOperationStats(prevQuery.data ?? []),
		[prevQuery.data],
	);
	const aggregates = useMemo(
		() => aggregateOperationsByOperation(rows),
		[rows],
	);

	const [sortField, setSortField] = useState<SortField>("totalRequests");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
	const [page, setPage] = useState(0);

	const sorted = useMemo(() => {
		const copy = [...aggregates];
		copy.sort((a, b) => {
			const av = a[sortField] ?? 0;
			const bv = b[sortField] ?? 0;
			return sortDir === "desc" ? bv - av : av - bv;
		});
		return copy;
	}, [aggregates, sortField, sortDir]);

	const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
	const chartRows = useMemo(
		() =>
			[...rows]
				.sort((a, b) => a.bucket.getTime() - b.bucket.getTime())
				.map((row) => ({
					time: new Date(row.bucket).toLocaleString(undefined, {
						month: "short",
						day: "numeric",
						...(granularity === "hour"
							? { hour: "2-digit" as const, minute: "2-digit" as const }
							: {}),
					}),
					p50: row.p50LatencyMs ?? 0,
					p95: row.p95LatencyMs ?? 0,
					p99: row.p99LatencyMs ?? 0,
				})),
		[rows, granularity],
	);

	function toggleSort(field: SortField) {
		if (field === sortField) {
			setSortDir((d) => (d === "desc" ? "asc" : "desc"));
		} else {
			setSortField(field);
			setSortDir("desc");
		}
		setPage(0);
	}

	function delta(current: number | null, previous: number | null) {
		if (current == null || previous == null || previous === 0) return null;
		return ((current - previous) / previous) * 100;
	}

	const loading = statsQuery.isPending;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Operations"
				description="Request volume, latency and errors per operation."
			>
				<div className="flex items-center gap-1 rounded-xl border bg-card p-1">
					{TIME_RANGE_PRESETS.map((preset) => (
						<button
							key={preset.value}
							type="button"
							onClick={() =>
								navigate({
									search: (prev) => ({
										...prev,
										range: preset.value,
										granularity: preset.value === "24h" ? "hour" : "day",
									}),
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
			</PageHeader>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label="Total requests"
					value={totals.totalRequests}
					delta={delta(totals.totalRequests, prevTotals.totalRequests)}
					loading={loading}
				/>
				<StatCard
					label="Avg latency"
					value={totals.avgLatencyMs}
					suffix="ms"
					decimals={1}
					delta={delta(totals.avgLatencyMs, prevTotals.avgLatencyMs)}
					invertDelta
					loading={loading}
				/>
				<StatCard
					label="p95 latency"
					value={totals.p95LatencyMs}
					suffix="ms"
					decimals={1}
					delta={delta(totals.p95LatencyMs, prevTotals.p95LatencyMs)}
					invertDelta
					loading={loading}
				/>
				<StatCard
					label="Error rate"
					value={totals.errorRatePct}
					suffix="%"
					decimals={2}
					delta={delta(totals.errorRatePct, prevTotals.errorRatePct)}
					invertDelta
					loading={loading}
				/>
			</div>

			<div className="rounded-2xl border bg-card p-4 shadow-aceternity">
				<p className="text-muted-foreground mb-4 px-2 text-sm font-medium">
					Latency percentiles
				</p>
				<div className="h-64">
					{chartRows.length > 0 ? (
						<ResponsiveContainer width="100%" height="100%">
							<AreaChart
								data={chartRows}
								margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
							>
								<defs>
									<linearGradient id="p50Fill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stopColor="#f17463" stopOpacity={0.25} />
										<stop offset="100%" stopColor="#f17463" stopOpacity={0} />
									</linearGradient>
								</defs>
								<CartesianGrid
									strokeDasharray="3 3"
									stroke="#eaedf1"
									vertical={false}
								/>
								<XAxis
									dataKey="time"
									tick={{ fontSize: 12, fill: "#8b8b8b" }}
									tickLine={false}
									axisLine={false}
									minTickGap={40}
								/>
								<YAxis
									tick={{ fontSize: 12, fill: "#8b8b8b" }}
									tickLine={false}
									axisLine={false}
									width={56}
								/>
								<Tooltip
									contentStyle={{
										borderRadius: 12,
										border: "1px solid #eaedf1",
										fontSize: 13,
									}}
									formatter={(value) => [
										`${Number(value).toFixed(1)} ms`,
										"Latency",
									]}
								/>
								<Area
									type="monotone"
									dataKey="p99"
									stroke="#d7d7d7"
									fill="none"
									strokeWidth={1.5}
									dot={false}
								/>
								<Area
									type="monotone"
									dataKey="p95"
									stroke="#8b8b8b"
									fill="none"
									strokeWidth={1.5}
									dot={false}
								/>
								<Area
									type="monotone"
									dataKey="p50"
									stroke="#f17463"
									strokeWidth={2}
									fill="url(#p50Fill)"
									dot={false}
								/>
							</AreaChart>
						</ResponsiveContainer>
					) : (
						<EmptyState
							icon={<Activity />}
							title={loading ? "Loading…" : "No operations in this period"}
							description="Install the Patiom plugin and send a request to see data here."
						/>
					)}
				</div>
			</div>

			<TableCard
				footer={
					<PaginationFooter
						from={sorted.length === 0 ? 0 : page * PAGE_SIZE + 1}
						to={Math.min((page + 1) * PAGE_SIZE, sorted.length)}
						total={sorted.length}
					/>
				}
			>
				<table className="w-full">
					<thead>
						<tr>
							<Th>Operation</Th>
							<Th
								className="text-right"
								sortable
								active={sortField === "totalRequests"}
								direction={sortDir}
								onSort={() => toggleSort("totalRequests")}
							>
								Requests
							</Th>
							<Th className="text-right">Avg (ms)</Th>
							<Th
								className="text-right"
								sortable
								active={sortField === "p95LatencyMs"}
								direction={sortDir}
								onSort={() => toggleSort("p95LatencyMs")}
							>
								p95 (ms)
							</Th>
							<Th
								className="text-right"
								sortable
								active={sortField === "errorCount"}
								direction={sortDir}
								onSort={() => toggleSort("errorCount")}
							>
								Errors
							</Th>
						</tr>
					</thead>
					<tbody>
						{pageRows.map((op) => (
							<Tr key={op.operationName}>
								<Td className="font-medium">{op.operationName}</Td>
								<Td className="text-right tabular-nums">
									{op.totalRequests.toLocaleString()}
								</Td>
								<Td className="text-muted-foreground text-right tabular-nums">
									{op.avgLatencyMs == null ? "—" : op.avgLatencyMs.toFixed(1)}
								</Td>
								<Td className="text-right tabular-nums">
									{op.p95LatencyMs == null ? "—" : op.p95LatencyMs.toFixed(1)}
								</Td>
								<Td
									className={cn(
										"text-right tabular-nums",
										op.errorCount > 0
											? "text-destructive font-medium"
											: "text-muted-foreground",
									)}
								>
									{op.errorCount}
								</Td>
							</Tr>
						))}
						{pageRows.length === 0 && (
							<tr>
								<td colSpan={5}>
									<EmptyState
										title={loading ? "Loading…" : "No operations found"}
										description="Operations appear here as soon as traffic flows through your API."
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
