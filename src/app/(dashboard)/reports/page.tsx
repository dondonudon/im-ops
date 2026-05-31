import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@/lib/utils";

export default async function ReportsPage() {
	const supabase = await createClient();
	const t = await getTranslations("pages.reports");
	const tLeadStatus = await getTranslations("status.lead");
	const tExpenseCat = await getTranslations("entity.expenseCategory");

	const [
		{ data: profitRows },
		{ data: monthlyExpenses },
		{ data: leadConversion },
		{ data: outstandingInvoices },
		{ data: lostProposals },
	] = await Promise.all([
		supabase
			.from("job_profit_summary")
			.select(
				"job_number, revenue, actual_spend, current_profit, cash_received",
			)
			.order("current_profit", { ascending: false })
			.limit(20),
		supabase
			.from("expenses")
			.select("category, amount")
			.gte("incurred_at", firstDayOfMonth()),
		supabase.from("leads").select("status"),
		supabase
			.from("invoices")
			.select("invoice_number, total_amount, paid_amount, due_date, status")
			.in("status", ["sent", "partially_paid", "overdue"]),
		supabase
			.from("proposals")
			.select("closed_reason")
			.in("status", ["lost", "expired"]),
	]);

	const expenseByCategory: Record<string, number> = {};
	for (const e of monthlyExpenses ?? []) {
		expenseByCategory[e.category] =
			(expenseByCategory[e.category] ?? 0) + e.amount;
	}

	const funnelCounts: Record<string, number> = {};
	for (const lead of leadConversion ?? []) {
		funnelCounts[lead.status] = (funnelCounts[lead.status] ?? 0) + 1;
	}
	const totalLeads = Object.values(funnelCounts).reduce((s, c) => s + c, 0);
	const convertedLeads = funnelCounts["converted"] ?? 0;
	const conversionRate =
		totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

	const totalRevenue = (profitRows ?? []).reduce(
		(s, r) => s + (r.revenue ?? 0),
		0,
	);
	const totalProfit = (profitRows ?? []).reduce(
		(s, r) => s + (r.current_profit ?? 0),
		0,
	);

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
			<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
				{t("title")}
			</h1>

			{/* KPI summary */}
			<section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
				{[
					{
						label: t("kpi.totalRevenue"),
						value: formatRupiah(totalRevenue),
						color: "text-brand-600",
					},
					{
						label: t("kpi.totalProfit"),
						value: formatRupiah(totalProfit),
						color: totalProfit >= 0 ? "text-green-600" : "text-red-600",
					},
					{
						label: t("kpi.leadConversion"),
						value: `${conversionRate}%`,
						color: "text-gray-900 dark:text-white",
					},
					{
						label: t("kpi.totalLeads"),
						value: String(totalLeads),
						color: "text-gray-900 dark:text-white",
					},
				].map((kpi) => (
					<div
						key={kpi.label}
						className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
					>
						<p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
							{kpi.label}
						</p>
						<p className={`text-2xl font-bold tabular-nums ${kpi.color}`}>
							{kpi.value}
						</p>
					</div>
				))}
			</section>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
					<h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
						{t("profitByJob.title")}
					</h2>
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-xs text-gray-400">
								<th scope="col" className="pb-2">
									{t("profitByJob.job")}
								</th>
								<th scope="col" className="pb-2 text-right">
									{t("profitByJob.revenue")}
								</th>
								<th scope="col" className="pb-2 text-right">
									{t("profitByJob.cost")}
								</th>
								<th scope="col" className="pb-2 text-right">
									{t("profitByJob.profit")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
							{(profitRows ?? []).slice(0, 10).map((r) => (
								<tr key={r.job_number}>
									<td className="py-2 font-mono text-xs">{r.job_number}</td>
									<td className="py-2 text-right tabular-nums">
										{formatRupiah(r.revenue ?? 0)}
									</td>
									<td className="py-2 text-right tabular-nums text-red-500">
										{formatRupiah(r.actual_spend ?? 0)}
									</td>
									<td
										className={`py-2 text-right tabular-nums font-medium ${(r.current_profit ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
									>
										{formatRupiah(r.current_profit ?? 0)}
									</td>
								</tr>
							))}
							{(profitRows ?? []).length === 0 && (
								<tr>
									<td colSpan={4} className="py-4 text-center text-gray-400">
										—
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</section>

				<div className="space-y-6">
					<section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
						<h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
							{t("expensesThisMonth")}
						</h2>
						{Object.keys(expenseByCategory).length === 0 ? (
							<p className="text-sm text-gray-400">{t("noExpensesThisMonth")}</p>
						) : (
							<ul className="space-y-2">
								{Object.entries(expenseByCategory)
									.sort(([, a], [, b]) => b - a)
									.map(([cat, amt]) => {
										let label: string;
										try {
											label = tExpenseCat(cat as never);
										} catch {
											label = cat;
										}
										return (
											<li key={cat} className="flex justify-between text-sm">
												<span className="text-gray-600 dark:text-gray-400">
													{label}
												</span>
												<span className="tabular-nums font-medium">
													{formatRupiah(amt)}
												</span>
											</li>
										);
									})}
							</ul>
						)}
					</section>

					<section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
						<h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
							{t("leadFunnel")}
						</h2>
						<ul className="space-y-2">
							{Object.entries(funnelCounts).map(([status, count]) => (
								<li key={status} className="flex justify-between text-sm">
									<span className="text-gray-600 dark:text-gray-400">
										{tLeadStatus(status as never)}
									</span>
									<span className="font-medium">{count}</span>
								</li>
							))}
							{Object.keys(funnelCounts).length === 0 && (
								<li className="text-sm text-gray-400">{t("noLeads")}</li>
							)}
						</ul>
					</section>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* AR aging */}
				<section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
							{t("arAging.title")}
						</h2>
						<span className="text-xs text-gray-500 tabular-nums">
							{t("arAging.totalLabel", { amount: formatRupiah(totalOutstanding) })}
						</span>
					</div>
					{totalOutstanding === 0 ? (
						<p className="text-sm text-gray-400">{t("arAging.noOutstanding")}</p>
					) : (
						<ul className="space-y-2">
							{Object.entries(aging).map(([bucket, amount]) => {
								const pct =
									totalOutstanding > 0
										? Math.round((amount / totalOutstanding) * 100)
										: 0;
								return (
									<li key={bucket} className="text-sm">
										<div className="flex justify-between mb-1">
											<span className="text-gray-600 dark:text-gray-400">
												{bucket === "current"
													? t("arAging.current")
													: t("arAging.overdue", { range: bucket })}
											</span>
											<span className="tabular-nums font-medium">
												{formatRupiah(amount)}
											</span>
										</div>
										<div
											className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden"
											aria-hidden="true"
										>
											<div
												className={`h-full ${
													bucket === "current"
														? "bg-green-500"
														: bucket === "1-30"
															? "bg-yellow-500"
															: bucket === "31-60"
																? "bg-orange-500"
																: "bg-red-500"
												}`}
												style={{ width: `${pct}%` }}
											/>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</section>

				{/* Lost reasons */}
				<section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
							{t("lostProposals.title")}
						</h2>
						<span className="text-xs text-gray-500 tabular-nums">
							{t("lostProposals.totalCount", { count: totalLost })}
						</span>
					</div>
					{totalLost === 0 ? (
						<p className="text-sm text-gray-400">{t("lostProposals.empty")}</p>
					) : (
						<ul className="space-y-2">
							{Object.entries(lostReasons)
								.sort(([, a], [, b]) => b - a)
								.map(([reason, count]) => (
									<li key={reason} className="flex justify-between text-sm">
										<span className="text-gray-600 dark:text-gray-400">
											{reason}
										</span>
										<span className="font-medium tabular-nums">
											{count}{" "}
											<span className="text-gray-400 text-xs">
												({Math.round((count / totalLost) * 100)}%)
											</span>
										</span>
									</li>
								))}
						</ul>
					)}
				</section>
			</div>
		</div>
	);
}

function firstDayOfMonth() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
