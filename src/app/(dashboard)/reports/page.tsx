import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ProfitBreakdownCard } from "@/components/reports/ProfitBreakdownCard";
import { YearlyProfitChart } from "@/components/reports/YearlyProfitChart";
import {
	Card,
	CardHeader,
	Money,
	MonthPicker,
	PageHeader,
	Table,
	TBody,
	TD,
	TH,
	THead,
	TR,
} from "@/components/ui";
import { monthRange, parseMonth } from "@/lib/month";
import { summarizeProfit } from "@/lib/profit";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/utils";

export default async function ReportsPage({
	searchParams,
}: {
	searchParams: Promise<{ month?: string }>;
}) {
	const { month: rawMonth } = await searchParams;
	const selectedMonth = parseMonth(rawMonth);
	const { start: monthStart, end: monthEnd } = monthRange(selectedMonth);

	const yearStr = selectedMonth.split("-")[0];
	const yearStart = `${yearStr}-01-01`;
	const yearEnd = `${Number(yearStr) + 1}-01-01`;
	const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

	const supabase = await createClient();
	const t = await getTranslations("pages.reports");
	const tLeadStatus = await getTranslations("status.lead");
	const tExpenseCat = await getTranslations("entity.expenseCategory");

	const [
		{ data: monthJobsData },
		{ data: monthlyExpenses },
		{ data: leadConversion },
		{ data: outstandingInvoices },
		{ data: lostProposals },
		{ data: revenueTargetRow },
		{ data: defaultTargetRow },
		{ data: yearJobsData },
		{ data: yearOpExpData },
	] = await Promise.all([
		// Jobs scheduled in this month (move_date) for revenue KPI + profit table
		supabase
			.from("jobs")
			.select("id, revenue, move_date")
			// Cancelled jobs keep their revenue value; exclude them from revenue/profit.
			.neq("status", "cancelled")
			.gte("move_date", monthStart)
			.lt("move_date", monthEnd),
		supabase
			.from("expenses")
			.select("category, amount, expense_type, incurred_at")
			.gte("incurred_at", monthStart)
			.lt("incurred_at", monthEnd),
		// Open pipeline leads created this month. Terminal statuses (converted, closed_lost)
		// are overridden below with their authoritative month sources so all funnel rows
		// share the same time dimension and total = sum of entries.
		supabase
			.from("leads")
			.select("status")
			.gte("created_at", monthStart)
			.lt("created_at", monthEnd)
			.neq("status", "converted")
			.neq("status", "closed_lost"),
		// AR aging is always current state, not month-filtered. Read the leaf-filtered
		// invoice_outstanding view so a master + its termin aren't double-counted.
		supabase
			.from("invoice_outstanding")
			.select("outstanding, due_date")
			.gt("outstanding", 0)
			.limit(500),
		// Proposals lost/expired this month, filtered by closed_at
		supabase
			.from("proposals")
			.select("closed_reason")
			.in("status", ["lost", "expired"])
			.gte("closed_at", monthStart)
			.lt("closed_at", monthEnd),
		// Per-month revenue target
		supabase
			.from("revenue_targets")
			.select("target_amount")
			.eq("year", Number(selectedMonth.split("-")[0]))
			.eq("month", Number(selectedMonth.split("-")[1]))
			.maybeSingle(),
		// Fallback default target
		supabase
			.from("system_settings")
			.select("value")
			.eq("key", "revenue_target_monthly")
			.maybeSingle(),
		// Yearly jobs — for annual profit chart (job cost comes from job_profit_summary
		// below, so we only need id + move_date to accrue each job to its month).
		supabase
			.from("jobs")
			.select("id, revenue, move_date")
			// Cancelled jobs keep their revenue value; exclude them from the annual chart.
			.neq("status", "cancelled")
			.gte("move_date", yearStart)
			.lt("move_date", yearEnd),
		// Yearly operational overhead — bucketed by incurred_at (no job to accrue to).
		supabase
			.from("expenses")
			.select("amount, incurred_at")
			.eq("expense_type", "operational")
			.gte("incurred_at", yearStart)
			.lt("incurred_at", yearEnd),
	]);

	// job_profit_summary has no date column — accrue each job to its move_date month.
	// Fetch the year's completed-job profit rows once; the selected month and the
	// annual chart both derive from this so their numbers can never diverge.
	const jobIdToMoveDate = new Map((yearJobsData ?? []).map((j) => [j.id, j.move_date]));
	const completedYearJobIds = (yearJobsData ?? [])
		.filter((j) => (j.move_date ?? "") <= todayStr)
		.map((j) => j.id);
	const { data: yearProfitRowsRaw } =
		completedYearJobIds.length > 0
			? await supabase
					.from("job_profit_summary")
					.select("job_id, job_number, revenue, actual_spend, current_profit")
					.in("job_id", completedYearJobIds)
			: { data: [] };
	const yearProfitRows = yearProfitRowsRaw ?? [];

	// Selected-month subset, sorted by move_date descending (latest first).
	const monthJobsMap = jobIdToMoveDate;
	const profitRows = yearProfitRows
		.filter((r) => (jobIdToMoveDate.get(r.job_id ?? "") ?? "").startsWith(selectedMonth))
		.sort((a, b) => {
			const da = jobIdToMoveDate.get(a.job_id ?? "") ?? "";
			const db = jobIdToMoveDate.get(b.job_id ?? "") ?? "";
			return db.localeCompare(da);
		});

	// Split the month's expenses by kind so the list reconciles with the profit
	// figures above it: job expenses feed job gross profit; operational overhead is
	// the bridge from gross to operating profit.
	const jobExpenseByCategory: Record<string, number> = {};
	const opExpenseByCategory: Record<string, number> = {};
	let monthOperationalTotal = 0;
	for (const e of monthlyExpenses ?? []) {
		if (e.expense_type === "operational") {
			opExpenseByCategory[e.category] = (opExpenseByCategory[e.category] ?? 0) + e.amount;
			monthOperationalTotal += e.amount ?? 0;
		} else {
			jobExpenseByCategory[e.category] = (jobExpenseByCategory[e.category] ?? 0) + e.amount;
		}
	}

	const funnelCounts: Record<string, number> = {};
	for (const lead of leadConversion ?? []) {
		funnelCounts[lead.status] = (funnelCounts[lead.status] ?? 0) + 1;
	}
	// Terminal statuses use authoritative month sources so the funnel total = Σ entries:
	//   converted  → jobs.move_date this month  (matches profit table)
	//   closed_lost → proposals.closed_at this month (matches Lost proposals section)
	const convertedLeads = (monthJobsData ?? []).length;
	if (convertedLeads > 0) funnelCounts.converted = convertedLeads;
	const lostThisMonth = (lostProposals ?? []).length;
	if (lostThisMonth > 0) funnelCounts.closed_lost = lostThisMonth;
	const totalLeads = Object.values(funnelCounts).reduce((s, c) => s + c, 0);
	const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

	const totalRevenue = (monthJobsData ?? []).reduce((s, j) => s + (j.revenue ?? 0), 0);
	// Single source of truth (src/lib/profit.ts): gross = Σ job current_profit;
	// operating = gross − operational overhead. The headline profit is the operating
	// (actual) figure — job cost AND overhead subtracted.
	const summary = summarizeProfit(profitRows, monthOperationalTotal);
	const completedRevenue = summary.completedRevenue;

	// Period breakdown: 1–15 vs 16–end of month
	const [ymYear, ymMonth] = selectedMonth.split("-").map(Number);
	const lastDay = new Date(ymYear, ymMonth, 0).getDate();

	const period1Jobs = (profitRows ?? []).filter((r) => {
		const date = monthJobsMap.get(r.job_id ?? "");
		return date ? Number(date.split("-")[2]) <= 15 : false;
	});
	const period2Jobs = (profitRows ?? []).filter((r) => {
		const date = monthJobsMap.get(r.job_id ?? "");
		return date ? Number(date.split("-")[2]) >= 16 : false;
	});

	// Operational overhead accrues to the period it was incurred in (same 1–15 / 16–end
	// split as jobs), so each period nets to a real operating profit and the two sum to
	// the month's operating profit.
	let period1Op = 0;
	let period2Op = 0;
	for (const e of monthlyExpenses ?? []) {
		if (e.expense_type !== "operational") continue;
		const day = e.incurred_at ? Number(e.incurred_at.split("-")[2]) : 0;
		if (day >= 16) period2Op += e.amount ?? 0;
		else period1Op += e.amount ?? 0;
	}

	const period1 = { ...summarizeProfit(period1Jobs, period1Op), count: period1Jobs.length };
	const period2 = { ...summarizeProfit(period2Jobs, period2Op), count: period2Jobs.length };

	const revenueTarget =
		revenueTargetRow?.target_amount ??
		(defaultTargetRow?.value ? Number(defaultTargetRow.value) : 0);
	const revenuePercent = revenueTarget > 0 ? Math.round((totalRevenue / revenueTarget) * 100) : 0;
	const revenueBarWidth = Math.min(100, revenuePercent);
	const isOverTarget = revenuePercent > 100;

	const aging = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
	const today = new Date(todayStr);
	for (const inv of outstandingInvoices ?? []) {
		const outstanding = inv.outstanding ?? 0;
		if (outstanding <= 0) continue;
		if (!inv.due_date) {
			aging.current += outstanding;
			continue;
		}
		const due = new Date(inv.due_date);
		const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
		if (days <= 0) aging.current += outstanding;
		else if (days <= 30) aging["1-30"] += outstanding;
		else if (days <= 60) aging["31-60"] += outstanding;
		else if (days <= 90) aging["61-90"] += outstanding;
		else aging["90+"] += outstanding;
	}
	const totalOutstanding = Object.values(aging).reduce((s, v) => s + v, 0);

	const lostReasons: Record<string, number> = {};
	const noReasonLabel = t("lostProposals.noReason");
	for (const p of lostProposals ?? []) {
		const key = p.closed_reason?.trim() || noReasonLabel;
		lostReasons[key] = (lostReasons[key] ?? 0) + 1;
	}
	const totalLost = Object.values(lostReasons).reduce((s, v) => s + v, 0);

	// Yearly profit data for chart — one entry per month, operating profit on the
	// same accrual basis as the KPI: gross (Σ job current_profit accrued to move_date)
	// minus operational overhead (incurred_at). `expenses` is the whole cost base.
	const yearlyProfitData = Array.from({ length: 12 }, (_, i) => {
		const m = i + 1;
		const monthStr = `${yearStr}-${String(m).padStart(2, "0")}`;
		const rows = yearProfitRows.filter((r) =>
			(jobIdToMoveDate.get(r.job_id ?? "") ?? "").startsWith(monthStr),
		);
		const opTotal = (yearOpExpData ?? [])
			.filter((e) => e.incurred_at?.startsWith(monthStr))
			.reduce((s, e) => s + (e.amount ?? 0), 0);
		const s = summarizeProfit(rows, opTotal);
		return {
			month: monthStr,
			revenue: s.completedRevenue,
			expenses: s.totalCost,
			profit: s.operatingProfit,
			isFuture: monthStr > todayStr.slice(0, 7),
			isSelected: monthStr === selectedMonth,
		};
	});

	return (
		<div className="space-y-8">
			<PageHeader title={t("title")} actions={<MonthPicker value={selectedMonth} />} />

			{/* KPI summary */}
			<section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
				{/* Revenue card — enhanced with target progress when available */}
				<Card className="p-5 overflow-hidden">
					<p className="text-xs text-ink-muted uppercase tracking-wide mb-1 truncate">
						{t("kpi.totalRevenue")}
					</p>
					<p className="text-lg sm:text-xl lg:text-2xl font-bold tabular-nums leading-tight text-primary-text">
						{formatRupiah(totalRevenue)}
					</p>
					{revenueTarget > 0 && (
						<div className="mt-2">
							<div className="flex justify-between text-[10px] text-ink-faint mb-1">
								<span>
									{t("kpi.target")}: {formatRupiah(revenueTarget)}
								</span>
								<span className={revenuePercent >= 100 ? "text-success-text font-semibold" : ""}>
									{revenuePercent}%
								</span>
							</div>
							<div
								className="h-1.5 rounded-full bg-subtle overflow-hidden"
								role="progressbar"
								aria-valuenow={revenuePercent}
								aria-valuemin={0}
								aria-valuemax={100}
							>
								<div
									className={`h-full rounded-full transition-all ${revenuePercent >= 100 ? "bg-success" : "bg-primary"}`}
									style={{ width: `${revenueBarWidth}%` }}
								/>
							</div>
							{isOverTarget && (
								<p className="text-[10px] text-success-text font-medium mt-0.5">
									+{revenuePercent - 100}% {t("kpi.overTarget")}
								</p>
							)}
						</div>
					)}
				</Card>

				<ProfitBreakdownCard
					operatingProfit={summary.operatingProfit}
					grossProfit={summary.grossProfit}
					operationalTotal={summary.operationalTotal}
					completedRevenue={completedRevenue}
					period1={period1}
					period2={period2}
					selectedMonth={selectedMonth}
					lastDay={lastDay}
				/>

				{[
					{
						label: t("kpi.leadConversion"),
						value: `${conversionRate}%`,
						className: "text-ink",
						sub: null,
					},
					{
						label: t("kpi.totalLeads"),
						value: String(totalLeads),
						className: "text-ink",
						sub: null,
					},
				].map((kpi) => (
					<Card key={kpi.label} className="p-5 overflow-hidden">
						<p className="text-xs text-ink-muted uppercase tracking-wide mb-1 truncate">
							{kpi.label}
						</p>
						<p
							className={`text-lg sm:text-xl lg:text-2xl font-bold tabular-nums leading-tight ${kpi.className}`}
						>
							{kpi.value}
						</p>
						{kpi.sub && (
							<p className={`text-xs tabular-nums mt-0.5 ${kpi.className}`}>
								{kpi.sub} {t("kpi.ofRevenue")}
							</p>
						)}
					</Card>
				))}
			</section>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<Card>
					<CardHeader title={t("profitByJob.title")} />
					<div className="p-5">
						<Table>
							<THead>
								<TH>{t("profitByJob.job")}</TH>
								<TH>{t("profitByJob.date")}</TH>
								<TH align="right">{t("profitByJob.revenue")}</TH>
								<TH align="right">{t("profitByJob.cost")}</TH>
								<TH align="right">{t("profitByJob.profit")}</TH>
								<TH align="right">{t("profitByJob.margin")}</TH>
							</THead>
							<TBody>
								{(profitRows ?? []).slice(0, 10).map((r) => {
									const margin =
										r.revenue && r.revenue > 0
											? Math.round(((r.current_profit ?? 0) / r.revenue) * 100)
											: null;
									return (
										<TR key={r.job_number}>
											<TD className="font-mono text-xs">
												<Link
													href={`/jobs/${r.job_id}`}
													className="text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
												>
													{r.job_number}
												</Link>
											</TD>
											<TD className="text-xs text-ink-muted tabular-nums whitespace-nowrap">
												{monthJobsMap.get(r.job_id ?? "") ?? "—"}
											</TD>
											<TD align="right">
												<Money value={r.revenue ?? 0} />
											</TD>
											<TD align="right">
												<Money value={r.actual_spend ?? 0} tone="danger" />
											</TD>
											<TD align="right">
												<Money
													value={r.current_profit ?? 0}
													tone={(r.current_profit ?? 0) >= 0 ? "positive" : "danger"}
													className="font-medium"
												/>
											</TD>
											<TD align="right">
												{margin !== null ? (
													<span
														className={`tabular-nums text-sm font-medium ${margin >= 0 ? "text-success" : "text-danger"}`}
													>
														{margin}%
													</span>
												) : (
													<span className="text-ink-faint">—</span>
												)}
											</TD>
										</TR>
									);
								})}
								{(profitRows ?? []).length === 0 && (
									<tr>
										<td colSpan={6} className="py-4 text-center text-ink-faint">
											—
										</td>
									</tr>
								)}
							</TBody>
						</Table>
					</div>
				</Card>

				<div className="space-y-6">
					<YearlyProfitChart data={yearlyProfitData} year={Number(yearStr)} />
					<Card>
						<CardHeader title={t("expensesThisMonth")} />
						<div className="p-5 space-y-4">
							{Object.keys(jobExpenseByCategory).length === 0 &&
							Object.keys(opExpenseByCategory).length === 0 ? (
								<p className="text-sm text-ink-faint">{t("noExpensesThisMonth")}</p>
							) : (
								(
									[
										{ title: t("expenseGroups.job"), data: jobExpenseByCategory },
										{ title: t("expenseGroups.operational"), data: opExpenseByCategory },
									] as const
								).map(({ title, data }) =>
									Object.keys(data).length === 0 ? null : (
										<div key={title}>
											<p className="text-[10px] uppercase tracking-wide text-ink-faint mb-1.5">
												{title}
											</p>
											<ul className="space-y-2">
												{Object.entries(data)
													.sort(([, a], [, b]) => b - a)
													.map(([cat, amt]) => {
														// Stored categories may be labels ("Packing materials") or
														// keys ("packing_materials"); normalize, then fall back to
														// the raw value if there's no translation.
														const key = cat.toLowerCase().replace(/[\s-]+/g, "_");
														const label = tExpenseCat.has(key as never)
															? tExpenseCat(key as never)
															: cat;
														return (
															<li key={cat} className="flex justify-between text-sm">
																<span className="text-ink-muted">{label}</span>
																<Money value={amt} className="font-medium" />
															</li>
														);
													})}
											</ul>
										</div>
									),
								)
							)}
						</div>
					</Card>

					<Card>
						<CardHeader title={t("leadFunnel")} />
						<div className="p-5">
							<ul className="space-y-2">
								{Object.entries(funnelCounts).map(([status, count]) => (
									<li key={status} className="flex justify-between text-sm">
										<span className="text-ink-muted">{tLeadStatus(status as never)}</span>
										<span className="font-medium text-ink">{count}</span>
									</li>
								))}
								{Object.keys(funnelCounts).length === 0 && (
									<li className="text-sm text-ink-faint">{t("noLeads")}</li>
								)}
							</ul>
						</div>
					</Card>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* AR aging */}
				<Card>
					<CardHeader
						title={t("arAging.title")}
						action={
							<span className="text-xs text-ink-muted tabular-nums">
								{t("arAging.totalLabel", { amount: formatRupiah(totalOutstanding) })}
							</span>
						}
					/>
					<div className="p-5">
						{totalOutstanding === 0 ? (
							<p className="text-sm text-ink-faint">{t("arAging.noOutstanding")}</p>
						) : (
							<ul className="space-y-2">
								{Object.entries(aging).map(([bucket, amount]) => {
									const pct =
										totalOutstanding > 0 ? Math.round((amount / totalOutstanding) * 100) : 0;
									return (
										<li key={bucket} className="text-sm">
											<div className="flex justify-between mb-1">
												<span className="text-ink-muted">
													{bucket === "current"
														? t("arAging.current")
														: t("arAging.overdue", { range: bucket })}
												</span>
												<Money value={amount} className="font-medium" />
											</div>
											<div className="h-1.5 bg-subtle rounded overflow-hidden" aria-hidden="true">
												<div
													className={`h-full ${
														bucket === "current"
															? "bg-success"
															: bucket === "1-30"
																? "bg-warning"
																: bucket === "31-60"
																	? "bg-warning"
																	: "bg-danger"
													}`}
													style={{ width: `${pct}%` }}
												/>
											</div>
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</Card>

				{/* Lost reasons */}
				<Card>
					<CardHeader
						title={t("lostProposals.title")}
						action={
							<span className="text-xs text-ink-muted tabular-nums">
								{t("lostProposals.totalCount", { count: totalLost })}
							</span>
						}
					/>
					<div className="p-5">
						{totalLost === 0 ? (
							<p className="text-sm text-ink-faint">{t("lostProposals.empty")}</p>
						) : (
							<ul className="space-y-2">
								{Object.entries(lostReasons)
									.sort(([, a], [, b]) => b - a)
									.map(([reason, count]) => (
										<li key={reason} className="flex justify-between text-sm">
											<span className="text-ink-muted">{reason}</span>
											<span className="font-medium tabular-nums text-ink">
												{count}{" "}
												<span className="text-ink-faint text-xs">
													({Math.round((count / totalLost) * 100)}%)
												</span>
											</span>
										</li>
									))}
							</ul>
						)}
					</div>
				</Card>
			</div>
		</div>
	);
}
