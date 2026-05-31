import { cn } from "@/lib/utils";

/** Centered empty / zero-state with icon, message and optional hint. */
export function EmptyState({
	icon,
	title,
	hint,
	className,
}: {
	icon?: React.ReactNode;
	title: React.ReactNode;
	hint?: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("px-5 py-10 text-center", className)}>
			{icon && (
				<div className="mx-auto mb-2 text-ink-faint" aria-hidden="true">
					{icon}
				</div>
			)}
			<p className="text-sm font-medium text-ink-muted">{title}</p>
			{hint && <p className="text-xs text-ink-faint mt-0.5">{hint}</p>}
		</div>
	);
}
