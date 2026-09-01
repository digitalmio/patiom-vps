import type { getOperationStats } from "@patiom/db";

export type OperationStatRow = Awaited<
	ReturnType<typeof getOperationStats>
>[number];

export type OperationTotals = {
	totalRequests: number;
	errorCount: number;
	errorRatePct: number | null;
	avgLatencyMs: number | null;
	p95LatencyMs: number | null;
};

export type OperationAggregate = {
	operationName: string;
	totalRequests: number;
	avgLatencyMs: number | null;
	p95LatencyMs: number | null;
	errorCount: number;
	errorRatePct: number | null;
};

function weightedAvg(
	summand: (row: OperationStatRow) => number | null,
	rows: OperationStatRow[],
): number | null {
	let weighted = 0;
	let weight = 0;
	for (const row of rows) {
		const value = summand(row);
		if (value == null) continue;
		weighted += value * row.totalRequests;
		weight += row.totalRequests;
	}
	return weight > 0 ? weighted / weight : null;
}

export function totalsFromOperationStats(
	rows: OperationStatRow[],
): OperationTotals {
	const totalRequests = rows.reduce((sum, row) => sum + row.totalRequests, 0);
	const errorCount = rows.reduce((sum, row) => sum + (row.errorCount ?? 0), 0);
	return {
		totalRequests,
		errorCount,
		errorRatePct: totalRequests > 0 ? (errorCount / totalRequests) * 100 : null,
		avgLatencyMs: weightedAvg((row) => row.avgLatencyMs, rows),
		p95LatencyMs: weightedAvg((row) => row.p95LatencyMs, rows),
	};
}

export function aggregateOperationsByOperation(
	rows: OperationStatRow[],
): OperationAggregate[] {
	const byOperation = new Map<string, OperationStatRow[]>();
	for (const row of rows) {
		const name = row.operationName ?? "(unnamed)";
		const list = byOperation.get(name);
		if (list) {
			list.push(row);
		} else {
			byOperation.set(name, [row]);
		}
	}

	const aggregates: OperationAggregate[] = [];
	for (const [operationName, operationRows] of byOperation) {
		const totalRequests = operationRows.reduce(
			(sum, row) => sum + row.totalRequests,
			0,
		);
		const errorCount = operationRows.reduce(
			(sum, row) => sum + (row.errorCount ?? 0),
			0,
		);
		aggregates.push({
			operationName,
			totalRequests,
			avgLatencyMs: weightedAvg((row) => row.avgLatencyMs, operationRows),
			p95LatencyMs: weightedAvg((row) => row.p95LatencyMs, operationRows),
			errorCount,
			errorRatePct:
				totalRequests > 0 ? (errorCount / totalRequests) * 100 : null,
		});
	}

	return aggregates.sort((a, b) => b.totalRequests - a.totalRequests);
}
