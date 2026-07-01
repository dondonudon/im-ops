import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/utils";

function parseMonth(raw?: string): string {
	if (raw && /^\d{4}-\d{2}$/.test(raw)) return raw;
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(ym: string): { start: string; end: string } {
	const [year, month] = ym.split("-").map(Number);
	const start = `${year}-${String(month).padStart(2, "0")}-01`;
	const next = new Date(year, month, 1);
	const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
	return { start, end };
}

export default async function ReportsPage({
	searchParams,
}: {
	searchParams: Promise<{ month?: string }>;
}) {
	const { month: rawMonth } = await searchParams;
	const selectedMonth = parseMonth(rawMonth);
	const { start: monthStart, end: monthEnd } = monthRange(selectedMonth);

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
	] = await Promise.all([
		// Jobs scheduled in this month (move_date) for revenue KPI + profit table
		supabase
			.from("jobs")
			.select("id, revenue, move_date")
			.gte("move_date", monthStart)
			.lt("move_date", monthEnd),
		supabase
			.from("expenses")
			.select("category, amount")
			.gte("incurred_at", monthStart)
			.lt("incurred_at", monthEnd),
		// Leads created in this month
		supabase
			.from("leads")
			.select("status")
			.gte("created_at", monthStart)
			.lt("created_at", monthEnd),
		// AR aging is always current state, not month-filtered
		supabase
			.from("invoices")
			.select("invoice_number, total_amount, paid_amount, due_date, status")
			.in("status", ["sent", "partially_paid", "overdue"]),
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
	]);

	// job_profit_summary has no date column — filter by the month's job IDs
	const monthJobsMap = new Map((monthJobsData ?? []).map((j) => [j.id, j.move_date]));
	const monthJobIds = [...monthJobsMap.keys()];
	const { data: profitRows } =
		monthJobIds.length > 0
			? await supabase
					.from("job_profit_summary")
					.select("job_id, job_number, revenue, actual_spend, current_profit")
					.in("job_id", monthJobIds)
					.order("current_profit", { ascending: false })
					.limit(10)
			: { data: [] };

	const expenseByCategory: Record<string, number> = {};
	for (const e of monthlyExpenses ?? []) {
		expenseByCategory[e.category] = (expenseByCategory[e.category] ?? 0) + e.amount;
	}

	const funnelCounts: Record<string, number> = {};
	for (const lead of leadConversion ?? []) {
		funnelCounts[lead.status] = (funnelCounts[lead.status] ?? 0) + 1;
	}
	const totalLeads = Object.values(funnelCounts).reduce((s, c) => s + c, 0);
	const convertedLeads = funnelCounts.converted ?? 0;
	const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

	const totalRevenue = (monthJobsData ?? []).reduce((s, j) => s + (j.revenue ?? 0), 0);
	const totalExpenses = (monthlyExpenses ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);
	const totalProfit = totalRevenue - totalExpenses;

	const revenueTarget =
		revenueTargetRow?.target_amount ??
		(defaultTargetRow?.value ? Number(defaultTargetRow.value) : 0);
	const revenuePercent = revenueTarget > 0 ? Math.round((totalRevenue / revenueTarget) * 100) : 0;
	const revenueBarWidth = Math.min(100, revenuePercent);
	const isOverTarget = revenuePercent > 100;

	const aging = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
	const today = new Date();
	for (const inv of outstandingInvoices ?? []) {
		const outstanding = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0);
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

				{[
					{
						label: t("kpi.totalProfit"),
						value: formatRupiah(totalProfit),
						className: totalProfit >= 0 ? "text-success" : "text-danger",
						sub: totalRevenue > 0 ? `${Math.round((totalProfit / totalRevenue) * 100)}%` : null,
					},
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
							<p className={`text-xs tabular-nums mt-0.5 ${kpi.className}`}>{kpi.sub} of revenue</p>
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
					<Card>
						<CardHeader title={t("expensesThisMonth")} />
						<div className="p-5">
							{Object.keys(expenseByCategory).length === 0 ? (
								<p className="text-sm text-ink-faint">{t("noExpensesThisMonth")}</p>
							) : (
								<ul className="space-y-2">
									{Object.entries(expenseByCategory)
										.sort(([, a], [, b]) => b - a)
										.map(([cat, amt]) => {
											// Stored categories may be labels ("Packing materials") or
											// keys ("packing_materials"); normalize, then fall back to
											// the raw value if there's no translation.
											const key = cat.toLowerCase().replace(/[\s-]+/g, "_");
											const label = tExpenseCat.has(key as never) ? tExpenseCat(key as never) : cat;
											return (
												<li key={cat} className="flex justify-between text-sm">
													<span className="text-ink-muted">{label}</span>
													<Money value={amt} className="font-medium" />
												</li>
											);
										})}
								</ul>
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
