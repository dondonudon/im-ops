import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/utils";

type Tone = "default" | "positive" | "danger" | "muted";

const TONE_CLS: Record<Tone, string> = {
	default: "text-ink",
	positive: "text-success",
	danger: "text-danger",
	muted: "text-ink-muted",
};

/** Consistent currency rendering: tabular figures + semantic coloring. */
export function Money({
	value,
	tone = "default",
	className,
}: {
	value: number;
	tone?: Tone;
	className?: string;
}) {
	return (
		<span className={cn("tabular-nums", TONE_CLS[tone], className)}>
			{formatRupiah(value)}
		</span>
	);
}
