"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NumericInput } from "@/components/shared/NumericInput";
import { parseMarginTiers, type MarginTier } from "@/lib/estimation/engine";

type Setting = {
	key: string;
	value: string;
	description: string | null;
};

const cellInput =
	"w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink text-right tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent";

/**
 * Dedicated editor for the `margin_tiers` setting (stored as a JSON array).
 * Tiers are ordered ascending by their upper bound; the final row is always the
 * "and above" catch-all (its `max` is forced to null on save). Persists the
 * whole array back to system_settings on every change.
 */
export function MarginTiersEditor({ setting }: { setting: Setting }) {
	const router = useRouter();
	const t = useTranslations("pages.settings.marginTiers");
	const tButtons = useTranslations("common.buttons");
	const [tiers, setTiers] = useState<MarginTier[]>(() =>
		parseMarginTiers(setting.value),
	);
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
		"idle",
	);

	/** Force the last tier to be the open-ended catch-all. */
	function normalize(next: MarginTier[]): MarginTier[] {
		return next.map((tier, i) =>
			i === next.length - 1 ? { ...tier, max: null } : tier,
		);
	}

	async function persist(next: MarginTier[]) {
		setSaveState("saving");
		const supabase = createClient();
		await supabase
			.from("system_settings")
			.update({
				value: JSON.stringify(normalize(next)),
				updated_at: new Date().toISOString(),
			})
			.eq("key", setting.key);
		setSaveState("saved");
		router.refresh();
		setTimeout(() => setSaveState("idle"), 2000);
	}

	function patchTier(index: number, patch: Partial<MarginTier>) {
		setTiers((prev) =>
			prev.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
		);
	}

	function addTier() {
		setTiers((prev) => {
			const insertAt = Math.max(0, prev.length - 1);
			const prevMax = insertAt > 0 ? (prev[insertAt - 1].max ?? 0) : 0;
			const next = [...prev];
			next.splice(insertAt, 0, {
				max: prevMax,
				rate_pct: 0,
				min_profit: 0,
			});
			persist(next);
			return next;
		});
	}

	function removeTier(index: number) {
		setTiers((prev) => {
			const next = prev.filter((_, i) => i !== index);
			persist(next);
			return next;
		});
	}

	const label = setting.description ?? setting.key;

	return (
		<div className="px-4 py-4">
			<div className="flex items-start justify-between gap-4 mb-3">
				<div className="min-w-0">
					<p className="text-sm font-medium text-ink leading-snug">{label}</p>
					<p className="text-xs font-mono text-ink-faint mt-0.5">
						{setting.key}
					</p>
				</div>
				{saveState !== "idle" && (
					<span
						className={`shrink-0 text-xs mt-0.5 ${saveState === "saved" ? "text-success" : "text-ink-faint"}`}
						aria-live="polite"
					>
						{saveState === "saved" ? tButtons("saved") : tButtons("saving")}
					</span>
				)}
			</div>

			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="text-xs font-semibold text-ink-muted uppercase tracking-widest">
							<th className="text-left font-semibold pb-2 pr-3">{t("upTo")}</th>
							<th className="text-right font-semibold pb-2 px-3 w-24">
								{t("ratePct")}
							</th>
							<th className="text-right font-semibold pb-2 px-3">
								{t("minProfit")}
							</th>
							<th className="pb-2 w-10" aria-hidden="true" />
						</tr>
					</thead>
					<tbody>
						{tiers.map((tier, i) => {
							const isLast = i === tiers.length - 1;
							return (
								<tr key={i}>
									<td className="py-1.5 pr-3">
										{isLast ? (
											<span className="text-ink-muted italic">
												{t("andAbove")}
											</span>
										) : (
											<NumericInput
												value={tier.max ?? 0}
												onChange={(v) => patchTier(i, { max: v })}
												onBlur={() => persist(tiers)}
												aria-label={t("upTo")}
												className={cellInput}
											/>
										)}
									</td>
									<td className="py-1.5 px-3">
										<NumericInput
											value={tier.rate_pct}
											onChange={(v) => patchTier(i, { rate_pct: v })}
											onBlur={() => persist(tiers)}
											aria-label={t("ratePct")}
											className={cellInput}
										/>
									</td>
									<td className="py-1.5 px-3">
										<NumericInput
											value={tier.min_profit}
											onChange={(v) => patchTier(i, { min_profit: v })}
											onBlur={() => persist(tiers)}
											aria-label={t("minProfit")}
											className={cellInput}
										/>
									</td>
									<td className="py-1.5 text-right">
										{!isLast && (
											<button
												type="button"
												onClick={() => removeTier(i)}
												aria-label={t("remove")}
												className="rounded-md p-1.5 text-ink-faint hover:text-danger hover:bg-danger-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
											>
												<svg
													width="16"
													height="16"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
													strokeLinecap="round"
													strokeLinejoin="round"
													aria-hidden="true"
												>
													<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
													<line x1="10" y1="11" x2="10" y2="17" />
													<line x1="14" y1="11" x2="14" y2="17" />
												</svg>
											</button>
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<button
				type="button"
				onClick={addTier}
				className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
			>
				<span aria-hidden="true">+</span> {t("addTier")}
			</button>
		</div>
	);
}
