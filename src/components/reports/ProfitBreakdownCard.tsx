"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Money } from "@/components/ui";
import { formatRupiah } from "@/lib/utils";

export interface PeriodData {
	profit: number;
	revenue: number;
	cost: number;
	count: number;
}

interface Props {
	totalProfit: number;
	completedRevenue: number;
	period1: PeriodData;
	period2: PeriodData;
	selectedMonth: string; // "YYYY-MM"
	lastDay: number;
}

export function ProfitBreakdownCard({
	totalProfit,
	completedRevenue,
	period1,
	period2,
	selectedMonth,
	lastDay,
}: Props) {
	const t = useTranslations("pages.reports");
	const [open, setOpen] = useState(false);
	const dialogRef = useRef<HTMLDivElement>(null);

	const margin = completedRevenue > 0 ? Math.round((totalProfit / completedRevenue) * 100) : null;

	const [ymYear, ymMonth] = selectedMonth.split("-").map(Number);
	const monthLabel = new Intl.DateTimeFormat(undefined, {
		month: "long",
		year: "numeric",
	}).format(new Date(ymYear, ymMonth - 1, 1));

	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open]);

	useEffect(() => {
		if (open) dialogRef.current?.focus();
	}, [open]);

	const periods = [
		{
			label: t("profitBreakdown.period1", { month: monthLabel }),
			data: period1,
		},
		{
			label: t("profitBreakdown.period2", { lastDay, month: monthLabel }),
			data: period2,
		},
	];

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="text-left w-full rounded-xl bg-surface border border-line shadow-token p-5 overflow-hidden hover:ring-2 hover:ring-[var(--ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-shadow cursor-pointer"
				aria-label={t("profitBreakdown.ariaCard")}
			>
				<p className="text-xs text-ink-muted uppercase tracking-wide mb-1 truncate">
					{t("kpi.totalProfit")}
				</p>
				<p
					className={`text-lg sm:text-xl lg:text-2xl font-bold tabular-nums leading-tight ${
						totalProfit >= 0 ? "text-success" : "text-danger"
					}`}
				>
					{formatRupiah(totalProfit)}
				</p>
				{margin !== null && (
					<p
						className={`text-xs tabular-nums mt-0.5 ${totalProfit >= 0 ? "text-success" : "text-danger"}`}
					>
						{margin}% {t("kpi.ofRevenue")}
					</p>
				)}
				<p className="text-[10px] text-ink-faint mt-1.5">{t("profitBreakdown.clickHint")}</p>
			</button>

			{open && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center p-4"
					role="dialog"
					aria-modal="true"
					aria-labelledby="profit-breakdown-title"
				>
					<div
						className="absolute inset-0 bg-black/50"
						onClick={() => setOpen(false)}
						aria-hidden="true"
					/>

					<div
						ref={dialogRef}
						tabIndex={-1}
						className="relative z-10 w-full max-w-md bg-surface border border-line rounded-2xl shadow-xl p-6 focus-visible:outline-none"
					>
						<div className="flex items-start justify-between mb-5">
							<div>
								<h2 id="profit-breakdown-title" className="text-sm font-semibold text-ink">
									{t("profitBreakdown.title")}
								</h2>
								<p className="text-xs text-ink-muted mt-0.5">{monthLabel}</p>
							</div>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="text-ink-muted hover:text-ink rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
								aria-label={t("profitBreakdown.close")}
							>
								<X className="w-4 h-4" />
							</button>
						</div>

						<div className="grid grid-cols-2 gap-4">
							{periods.map(({ label, data }) => {
								const periodMargin =
									data.revenue > 0 ? Math.round((data.profit / data.revenue) * 100) : null;
								return (
									<div key={label} className="bg-surface-raised border border-line rounded-xl p-4">
										<p className="text-xs font-medium text-ink-muted mb-3">{label}</p>
										<div className="mb-3">
											<p className="text-[10px] text-ink-faint uppercase tracking-wide mb-0.5">
												{t("profitBreakdown.profit")}
											</p>
											<p
												className={`text-xl font-bold tabular-nums ${
													data.profit >= 0 ? "text-success" : "text-danger"
												}`}
											>
												{formatRupiah(data.profit)}
											</p>
											{periodMargin !== null && (
												<p
													className={`text-xs tabular-nums ${
														data.profit >= 0 ? "text-success" : "text-danger"
													}`}
												>
													{periodMargin}%
												</p>
											)}
										</div>
										<div className="space-y-1.5 pt-3 border-t border-line">
											<div className="flex justify-between text-xs">
												<span className="text-ink-muted">{t("profitBreakdown.revenue")}</span>
												<Money value={data.revenue} className="font-medium" />
											</div>
											<div className="flex justify-between text-xs">
												<span className="text-ink-muted">{t("profitBreakdown.cost")}</span>
												<Money value={data.cost} tone="danger" className="font-medium" />
											</div>
											<div className="flex justify-between text-xs">
												<span className="text-ink-muted">{t("profitBreakdown.jobs")}</span>
												<span className="font-medium text-ink tabular-nums">{data.count}</span>
											</div>
										</div>
									</div>
								);
							})}
						</div>

						<div className="mt-4 pt-4 border-t border-line flex justify-between items-center">
							<span className="text-xs text-ink-muted">{t("profitBreakdown.totalProfit")}</span>
							<Money
								value={totalProfit}
								tone={totalProfit >= 0 ? "positive" : "danger"}
								className="text-base font-bold"
							/>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
