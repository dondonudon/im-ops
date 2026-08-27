import { Fragment } from "react";
import { cn } from "@/lib/utils";

export function RouteLine({
	points,
	className,
}: {
	points: (string | null | undefined)[];
	className?: string;
}) {
	const list = points.map((p) => p || "—");
	if (list.length === 0) list.push("—", "—");

	return (
		<div className={cn("flex items-center gap-2 text-xs text-ink-muted min-w-0", className)}>
			{list.map((point, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed display list, points may repeat (e.g. "—" placeholders)
				<Fragment key={`${i}-${point}`}>
					{i > 0 && <span className="flex-1 border-t border-dashed border-line min-w-[12px]" />}
					<span className="flex items-center gap-1.5 min-w-0">
						<span
							className={cn(
								"h-2 w-2 rounded-full shrink-0",
								i === list.length - 1 ? "bg-primary" : "border-2 border-primary",
							)}
						/>
						<span className="truncate min-w-0">{point}</span>
					</span>
				</Fragment>
			))}
		</div>
	);
}
