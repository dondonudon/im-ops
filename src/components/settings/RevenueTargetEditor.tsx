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

function monthKey(year: number, month: number): string {
	return `${year}-${String(month).padStart(2, "0")}`;
}

function currentYearMonth(): { year: number; month: number } {
	const now = new Date();
	return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

/** Year range: 3 years back to 3 years ahead. */
function yearOptions(): number[] {
	const y = new Date().getFullYear();
	return Array.from({ length: 7 }, (_, i) => y - 3 + i);
}

const SELECT_CLS =
	"border border-line rounded-lg px-3 py-1.5 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] text-ink";

export function RevenueTargetEditor({ defaultTarget, initialTargets }: Props) {
	const t = useTranslations("pages.settings.revenueTargets");
	const router = useRouter();

	const initMap: Record<string, number> = {};
	for (const row of initialTargets) {
		initMap[monthKey(row.year, row.month)] = row.target_amount;
	}

	const [values, setValues] = useState<Record<string, number>>(initMap);
	const [selected, setSelected] = useState(currentYearMonth);
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
	const [, startTransition] = useTransition();

	const { year, month } = selected;
	const selectedKey = monthKey(year, month);
	const value = values[selectedKey] ?? 0;
	const hasExplicit = selectedKey in values && values[selectedKey] > 0;

	async function handleBlur() {
		const amount = values[selectedKey] ?? 0;
		setSaveState("saving");

		const supabase = createClient();
		await supabase
			.from("revenue_targets")
			.upsert(
				{ year, month, target_amount: amount, updated_at: new Date().toISOString() },
				{ onConflict: "year,month" },
			);

		setSaveState("saved");
		startTransition(() => router.refresh());
		setTimeout(() => setSaveState("idle"), 2000);
	}

	return (
		<section aria-label={t("title")} className="mt-8">
			<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-widest mb-1">
				{t("title")}
			</h2>
			<p className="text-xs text-ink-faint mb-4">{t("description")}</p>

			<div className="rounded-xl border border-line bg-surface p-4 flex flex-col sm:flex-row sm:items-center gap-3">
				<div className="flex items-center gap-2 shrink-0">
					<select
						value={month}
						onChange={(e) => {
							setSelected((s) => ({ ...s, month: Number(e.target.value) }));
							setSaveState("idle");
						}}
						className={SELECT_CLS}
						aria-label="Month"
					>
						{MONTH_NAMES.map((name, i) => (
							<option key={name} value={i + 1}>
								{name}
							</option>
						))}
					</select>
					<select
						value={year}
						onChange={(e) => {
							setSelected((s) => ({ ...s, year: Number(e.target.value) }));
							setSaveState("idle");
						}}
						className={SELECT_CLS}
						aria-label="Year"
					>
						{yearOptions().map((y) => (
							<option key={y} value={y}>
								{y}
							</option>
						))}
					</select>
				</div>

				<div className="flex items-center gap-2 flex-1">
					<NumericInput
						value={value}
						onChange={(v) => setValues((prev) => ({ ...prev, [selectedKey]: v }))}
						onBlur={handleBlur}
						placeholder={new Intl.NumberFormat("id-ID").format(defaultTarget)}
						className="flex-1 text-right text-sm font-medium tabular-nums border border-line rounded-lg px-3 py-1.5 bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
						aria-label={t("inputLabel", { month: selectedKey })}
					/>
					<span className="text-xs w-10 text-right shrink-0">
						{saveState === "saving" ? (
							<span className="text-ink-faint">…</span>
						) : saveState === "saved" ? (
							<span className="text-success">✓</span>
						) : null}
					</span>
				</div>
			</div>

			{!hasExplicit && (
				<p className="text-xs text-ink-faint mt-2">
					{t("defaultHint", { amount: new Intl.NumberFormat("id-ID").format(defaultTarget) })}
				</p>
			)}
		</section>
	);
}
