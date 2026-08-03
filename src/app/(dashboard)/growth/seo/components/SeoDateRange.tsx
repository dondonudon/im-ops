"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import type { RangePreset } from "@/lib/search-console/dates";
import { cn } from "@/lib/utils";

const PRESETS: RangePreset[] = ["28d", "3m"];

/** Preset switcher — pushes `?range=` and lets the Server Component re-fetch. */
export function SeoDateRange({ current }: { current: RangePreset }) {
	const t = useTranslations("pages.seo.range");
	const router = useRouter();
	const pathname = usePathname();
	const [isPending, startTransition] = useTransition();

	const select = (preset: RangePreset) => {
		if (preset === current) return;
		startTransition(() => {
			router.push(`${pathname}?range=${preset}`);
		});
	};

	return (
		<div
			className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-1"
			role="tablist"
			aria-label={t("label")}
		>
			{PRESETS.map((preset) => {
				const active = preset === current;
				return (
					<button
						key={preset}
						type="button"
						role="tab"
						aria-selected={active}
						disabled={isPending}
						onClick={() => select(preset)}
						className={cn(
							"px-3 py-1.5 text-sm font-semibold rounded-md transition-colors disabled:opacity-60",
							active ? "bg-primary text-primary-fg" : "text-ink-muted hover:text-ink",
						)}
					>
						{t(preset)}
					</button>
				);
			})}
		</div>
	);
}
