import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "positive" | "pending" | "danger";

const TONES: Record<Tone, string> = {
	neutral: "bg-subtle text-ink-muted",
	info: "bg-primary-subtle text-primary-text",
	positive: "bg-success-bg text-success-text",
	pending: "bg-warning-bg text-warning-text",
	danger: "bg-danger-bg text-danger-text",
};

const DOT: Record<Tone, string> = {
	neutral: "bg-ink-faint",
	info: "bg-primary",
	positive: "bg-success",
	pending: "bg-warning",
	danger: "bg-danger",
};

/** Token-backed status pill. Theme-aware with no dark: variants. */
export function Badge({
	children,
	tone = "neutral",
	dot = false,
	className,
}: {
	children: React.ReactNode;
	tone?: Tone;
	dot?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
				TONES[tone],
				className,
			)}
		>
			{dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} aria-hidden="true" />}
			{children}
		</span>
	);
}
