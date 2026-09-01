import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
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
import { projectClients } from "@/services/analytics-sfn";

export const Route = createFileRoute("/dashboard/project/$projectId/clients")({
	component: RouteComponent,
	staticData: {
		title: "Clients",
	},
	validateSearch: (search: Record<string, unknown>) => ({
		range: (search.range as TimeRangePreset) ?? ("7d" as const),
	}),
});

const PAGE_SIZE = 25;

function RouteComponent() {
	const { projectId } = Route.useParams();
	const { range } = Route.useSearch();
	const navigate = Route.useNavigate();

	const { from, to } = rangeFromPreset(range);

	const clientsQuery = useQuery({
		queryKey: ["project-clients", projectId, range],
		queryFn: () =>
			projectClients({ data: { projectId, from, to, limit: 200 } }),
	});

	const rows = useMemo(
		() =>
			(clientsQuery.data ?? []).map((row) => ({
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
		[clientsQuery.data],
	);

	const pageRows = rows.slice(0, PAGE_SIZE);

	const loading = clientsQuery.isPending;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Clients"
				description="Traffic, latency and errors by GraphQL client library and version."
			>
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
							<Th>Client</Th>
							<Th className="text-right">Requests</Th>
							<Th className="text-right">Share</Th>
							<Th className="text-right">Avg (ms)</Th>
							<Th className="text-right">p95 (ms)</Th>
							<Th className="text-right">Errors</Th>
							<Th className="text-right">Last seen</Th>
						</tr>
					</thead>
					<tbody>
						{pageRows.map((row) => (
							<Tr
								key={`${row.clientName ?? "unknown"}:${row.clientVersion ?? "-"}`}
							>
								<Td>
									<div className="font-medium">
										{row.clientName ?? "Unknown client"}
									</div>
									{row.clientVersion && (
										<div className="text-muted-foreground text-xs">
											{row.clientVersion}
										</div>
									)}
								</Td>
								<Td className="text-right tabular-nums">
									{row.totalRequests.toLocaleString()}
								</Td>
								<Td className="text-muted-foreground text-right tabular-nums">
									{row.sharePct == null ? "—" : `${row.sharePct.toFixed(1)}%`}
								</Td>
								<Td className="text-muted-foreground text-right tabular-nums">
									{row.avgLatencyMs == null ? "—" : row.avgLatencyMs.toFixed(1)}
								</Td>
								<Td className="text-right tabular-nums">
									{row.p95LatencyMs == null ? "—" : row.p95LatencyMs.toFixed(1)}
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
								<Td className="text-muted-foreground text-right tabular-nums">
									{new Date(row.lastSeenAt).toLocaleString(undefined, {
										month: "short",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})}
								</Td>
							</Tr>
						))}
						{pageRows.length === 0 && (
							<tr>
								<td colSpan={7}>
									<EmptyState
										icon={<Users />}
										title={loading ? "Loading…" : "No client data"}
										description="Clients are identified from x-graphql-client-name/version headers or your user agent."
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
