"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { createClient } from "@/lib/supabase/client";

export type MonthTarget = {
	year: number;
	month: number;
	target_amount: number;
};

type Props = {
	defaultTarget: number;
	initialTargets: MonthTarget[];
};

/** Generate a window of months: 3 past + current + 11 future (15 total). */
function generateMonthWindow(): { year: number; month: number }[] {
	const now = new Date();
	const months: { year: number; month: number }[] = [];
	for (let offset = -3; offset <= 11; offset++) {
		const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
		months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
	}
	return months;
}

function monthKey(year: number, month: number): string {
	return `${year}-${String(month).padStart(2, "0")}`;
}

function formatMonthLabel(year: number, month: number): string {
	const d = new Date(year, month - 1, 1);
	return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(d);
}

function isCurrentMonth(year: number, month: number): boolean {
	const now = new Date();
	return year === now.getFullYear() && month === now.getMonth() + 1;
}

export function RevenueTargetEditor({ defaultTarget, initialTargets }: Props) {
	const t = useTranslations("pages.settings.revenueTargets");
	const tButtons = useTranslations("common.buttons");
	const router = useRouter();

	const initMap: Record<string, number> = {};
	for (const row of initialTargets) {
		initMap[monthKey(row.year, row.month)] = row.target_amount;
	}

	const [values, setValues] = useState<Record<string, number>>(initMap);
	const [savingKey, setSavingKey] = useState<string | null>(null);
	const [savedKey, setSavedKey] = useState<string | null>(null);
	const [, startTransition] = useTransition();

	const months = generateMonthWindow();

	async function handleBlur(year: number, month: number) {
		const key = monthKey(year, month);
		const amount = values[key] ?? 0;

		setSavingKey(key);
		setSavedKey(null);

		const supabase = createClient();
		await supabase.from("revenue_targets").upsert(
			{
				year,
				month,
				target_amount: amount,
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "year,month" },
		);

		setSavingKey(null);
		setSavedKey(key);
		startTransition(() => router.refresh());

		setTimeout(() => setSavedKey(null), 2000);
	}

	return (
		<section aria-label={t("title")} className="mt-8">
			<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-widest mb-1">
				{t("title")}
			</h2>
			<p className="text-xs text-ink-faint mb-3">{t("description")}</p>

			<div className="rounded-xl border border-line bg-surface divide-y divide-line">
				{months.map(({ year, month }) => {
					const key = monthKey(year, month);
					const value = values[key] ?? 0;
					const isCurrent = isCurrentMonth(year, month);
					const isExplicit = key in values && values[key] > 0;

					return (
						<div key={key} className="flex items-center justify-between gap-4 px-4 py-3">
							<span
								className={[
									"text-sm shrink-0",
									isCurrent ? "font-semibold text-ink" : "text-ink-muted",
								].join(" ")}
							>
								{formatMonthLabel(year, month)}
								{isCurrent && (
									<span className="ml-2 text-[10px] font-medium text-primary-text bg-primary/10 rounded px-1.5 py-0.5">
										{t("current")}
									</span>
								)}
							</span>

							<div className="flex items-center gap-2 min-w-0">
								{!isExplicit && value === 0 && (
									<span className="text-xs text-ink-faint hidden sm:block">
										{t("defaultHint", {
											amount: new Intl.NumberFormat("id-ID").format(defaultTarget),
										})}
									</span>
								)}
								<div className="relative">
									<NumericInput
										value={value}
										onChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
										onBlur={() => handleBlur(year, month)}
										placeholder={new Intl.NumberFormat("id-ID").format(defaultTarget)}
										className="w-40 text-right text-sm font-medium tabular-nums border border-line rounded-lg px-3 py-1.5 bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
										aria-label={t("inputLabel", { month: formatMonthLabel(year, month) })}
									/>
								</div>
								<span className="text-xs w-12 text-right shrink-0">
									{savingKey === key ? (
										<span className="text-ink-faint">{tButtons("saving")}</span>
									) : savedKey === key ? (
										<span className="text-success">✓</span>
									) : null}
								</span>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}
