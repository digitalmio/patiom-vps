import type React from "react";
import { cn } from "@/lib/utils";

export function TableCard({
	children,
	footer,
	className,
}: {
	children: React.ReactNode;
	footer?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-2xl border bg-card shadow-aceternity",
				className,
			)}
		>
			<div className="overflow-x-auto">{children}</div>
			{footer && (
				<div className="border-border/60 flex items-center justify-between border-t px-4 py-3">
					{footer}
				</div>
			)}
		</div>
	);
}

export function Th({
	children,
	className,
	sortable,
	active,
	direction,
	onSort,
}: {
	children: React.ReactNode;
	className?: string;
	sortable?: boolean;
	active?: boolean;
	direction?: "asc" | "desc";
	onSort?: () => void;
}) {
	if (!sortable) {
		return (
			<th
				className={cn(
					"text-muted-foreground border-border/60 border-b px-4 py-3 text-left text-xs font-medium tracking-wide uppercase",
					className,
				)}
			>
				{children}
			</th>
		);
	}

	return (
		<th
			className={cn(
				"border-border/60 border-b px-4 py-3 text-left text-xs font-medium tracking-wide uppercase",
				className,
			)}
		>
			<button
				type="button"
				onClick={onSort}
				className={cn(
					"flex cursor-pointer items-center gap-1 uppercase",
					active
						? "text-foreground"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				{children}
				<span className="text-[10px]">
					{active ? (direction === "asc" ? "▲" : "▼") : "⇅"}
				</span>
			</button>
		</th>
	);
}

export function Td({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<td
			className={cn("border-border/40 border-b px-4 py-3 text-sm", className)}
		>
			{children}
		</td>
	);
}

export function Tr({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<tr className={cn("hover:bg-muted/60 transition-colors", className)}>
			{children}
		</tr>
	);
}

export function PaginationFooter({
	from,
	to,
	total,
}: {
	from: number;
	to: number;
	total: number;
}) {
	return (
		<>
			<p className="text-muted-foreground text-sm">
				{total === 0 ? "0 results" : `${from}–${to} of ${total}`}
			</p>
		</>
	);
}
