import { cn } from "@/lib/utils";

/** Standard surface card — token-backed, single elevation level. */
export function Card({
	className,
	children,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"bg-surface border border-line rounded-xl shadow-token",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

/** Card header row: title on the left, optional action node on the right. */
export function CardHeader({
	title,
	action,
	className,
}: {
	title: React.ReactNode;
	action?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-3 px-5 py-4 border-b border-line",
				className,
			)}
		>
			<h2 className="text-sm font-semibold text-ink">{title}</h2>
			{action}
		</div>
	);
}
