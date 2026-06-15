import Link from "next/link";
import type { Tone } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

const ACCENT: Record<Tone, string> = {
	neutral: "text-ink-muted bg-subtle",
	info: "text-primary bg-primary-subtle",
	positive: "text-success bg-success-bg",
	pending: "text-warning bg-warning-bg",
	danger: "text-danger bg-danger-bg",
};

/** Compact KPI stat — icon chip, big value, label and sub. Optionally a link. */
export function Stat({
	icon,
	label,
	value,
	sub,
	tone = "info",
	href,
}: {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
	sub?: React.ReactNode;
	tone?: Tone;
	href?: string;
}) {
	const inner = (
		<>
			<div className="flex items-center gap-2 mb-3 min-w-0">
				<span
					className={cn(
						"flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
						ACCENT[tone],
					)}
				>
					{icon}
				</span>
				<p className="text-xs font-semibold uppercase tracking-wide text-ink-muted truncate">
					{label}
				</p>
			</div>
			<p className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold leading-tight text-ink tabular-nums">
				{value}
			</p>
			{sub && <p className="text-xs text-ink-muted mt-1.5">{sub}</p>}
		</>
	);

	const cls =
		"bg-surface border border-line rounded-xl shadow-token p-4 transition-all overflow-hidden";

	return href ? (
		<Link
			href={href}
			className={cn(
				cls,
				"hover:border-line-strong hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
			)}
		>
			{inner}
		</Link>
	) : (
		<div className={cls}>{inner}</div>
	);
}
