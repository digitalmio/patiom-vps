import type React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
	title,
	description,
	icon,
	className,
}: {
	title: string;
	description?: string;
	icon?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-2 px-6 py-16 text-center",
				className,
			)}
		>
			{icon && (
				<div className="text-muted-foreground/50 mb-1 [&_svg]:h-10 [&_svg]:w-10">
					{icon}
				</div>
			)}
			<p className="font-medium">{title}</p>
			{description && (
				<p className="text-muted-foreground max-w-sm text-sm">{description}</p>
			)}
		</div>
	);
}
