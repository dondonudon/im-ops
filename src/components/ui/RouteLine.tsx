import { cn } from "@/lib/utils";

/**
 * pickup → destination route line. A small logistics-identity moment used on
 * deal cards, dispatch rows and job headers.
 */
export function RouteLine({
	from,
	to,
	className,
}: {
	from: string | null | undefined;
	to: string | null | undefined;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 text-xs text-ink-muted min-w-0",
				className,
			)}
		>
			<span className="flex items-center gap-1.5 min-w-0">
				<span className="h-2 w-2 rounded-full border-2 border-primary shrink-0" />
				<span className="truncate">{from || "—"}</span>
			</span>
			<span className="flex-1 border-t border-dashed border-line min-w-[12px]" />
			<span className="flex items-center gap-1.5 min-w-0">
				<span className="h-2 w-2 rounded-full bg-primary shrink-0" />
				<span className="truncate">{to || "—"}</span>
			</span>
		</div>
	);
}
