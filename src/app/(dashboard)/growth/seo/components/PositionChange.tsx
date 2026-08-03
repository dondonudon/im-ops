import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Position point-change indicator; positive delta = improved (rank moved up). */
export function PositionChange({ delta }: { delta: number | null }) {
	if (delta === null || Math.abs(delta) < 0.05) {
		return (
			<span className="inline-flex items-center justify-end gap-1 text-ink-faint">
				<Minus size={13} aria-hidden />—
			</span>
		);
	}
	const improved = delta > 0;
	return (
		<span
			className={cn(
				"inline-flex items-center justify-end gap-1 tabular-nums",
				improved ? "text-success-text" : "text-danger-text",
			)}
		>
			{improved ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />}
			{Math.abs(delta).toFixed(1)}
		</span>
	);
}
