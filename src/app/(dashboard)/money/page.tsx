import { AlertTriangle, Banknote, Receipt, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	Card,
	CardHeader,
	EmptyState,
	Money,
	MonthPicker,
	PageHeader,
	Stat,
} from "@/components/ui";
import { monthRange, parseMonth } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRupiah } from "@/lib/utils";

type Payment = {
	id: string;
	amount: number;
	paid_at: string | null;
	method: string | null;
	invoice_id: string | null;
	jobs: { id: string; job_number: string } | null;
	invoices: { invoice_number: string; label: string | null } | null;
};

type Expense = {
	id: string;
	amount: number;
	incurred_at: string;
	category: string;
	description: string | null;
	expense_type: "job" | "operational";
	job_id: string | null;
	jobs: { job_number: string } | null;
};

export default async function MoneyPage({
	searchParams,
}: {
	searchParams: Promise<{ month?: string }>;
}) {
	const { month: rawMonth } = await searchParams;
	const selectedMonth = parseMonth(rawMonth);
	const { start: monthStart, end: monthEnd } = monthRange(selectedMonth);

	const t = await getTranslations("money");
	const tInv = await getTranslations("status.invoice");
	const supabase = await createClient();

	const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

	const [
		{ data: arTotals },
		{ data: statusBreakdown },
		{ data: monthlyPayments },
		{ data: monthlyExp },
		{ data: paymentsData },
		{ data: expensesData },
		{ data: monthJobsData },
	] = await Promise.all([
		// Server-side aggregates — no row count cap, always accurate
		supabase.rpc("get_ar_totals").single(),
		supabase.rpc("get_invoice_status_breakdown"),
		// Actual cash received: payments made in this month
		supabase.from("payments").select("amount").gte("paid_at", monthStart).lt("paid_at", monthEnd),
		// expense_type is selected, NOT filtered — the two kinds are partitioned below
		// so the page can show job gross profit and operating profit separately.
		supabase
			.from("expenses")
			.select("amount, expense_type")
			.gte("incurred_at", monthStart)
			.lt("incurred_at", monthEnd),
		// Recent payments in the selected month
		supabase
			.from("payments")
			.select(
				"id, amount, paid_at, method, invoice_id, jobs(id, job_number), invoices(invoice_number, label)",
			)
			.gte("paid_at", monthStart)
			.lt("paid_at", monthEnd)
			.order("paid_at", { ascending: false })
			.limit(8),
		// Recent expenses in the selected month (both job + operational kinds)
		supabase
			.from("expenses")
			.select(
				"id, amount, incurred_at, category, description, expense_type, job_id, jobs(job_number)",
			)
			.gte("incurred_at", monthStart)
			.lt("incurred_at", monthEnd)
			.order("incurred_at", { ascending: false })
			.limit(8),
		// Jobs scheduled this month — for NET (revenue basis, consistent with reports)
		supabase
			.from("jobs")
			.select("id, revenue, move_date")
			// Cancelled jobs keep their revenue value; exclude them from the KPI.
			.neq("status", "cancelled")
			.gte("move_date", monthStart)
			.lt("move_date", monthEnd),
	]);

	const payments = (paymentsData ?? []) as Payment[];
	const expenses = (expensesData ?? []) as Expense[];

	const totalOutstanding = Number(arTotals?.total_outstanding ?? 0);
	const outstandingCount = Number(arTotals?.outstanding_count ?? 0);
	const overdueAmount = Number(arTotals?.overdue_amount ?? 0);
	const overdueCount = Number(arTotals?.overdue_count ?? 0);
	// Cash actually received this month (for CASH IN card)
	const cashIn = (monthlyPayments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
	// Partition the month's expenses by kind. Job expenses are charged against the
	// jobs that ran this month; operational expenses (bulk packing materials, ads,
	// utilities) have no job and are overhead for the month they were bought in.
	let jobExpenses = 0;
	let operationalTotal = 0;
	for (const e of monthlyExp ?? []) {
		if (e.expense_type === "operational") operationalTotal += e.amount ?? 0;
		else jobExpenses += e.amount ?? 0;
	}
	// NET uses job revenue from completed jobs — consistent with reports page TOTAL PROFIT
	const completedRevenue = (monthJobsData ?? [])
		.filter((j) => (j.move_date ?? "") <= todayStr)
		.reduce((s, j) => s + (j.revenue ?? 0), 0);
	const jobGrossProfit = completedRevenue - jobExpenses;
	const operatingProfit = jobGrossProfit - operationalTotal;

	// AR aging buckets — pre-computed server-side
	const agingRows: { label: string; amount: number; tone: string }[] = [
		{
			label: t("agingCurrent"),
			amount: Number(arTotals?.aging_current ?? 0),
			tone: "bg-ink-faint",
		},
		{ label: t("aging1"), amount: Number(arTotals?.aging_1_30 ?? 0), tone: "bg-warning" },
		{ label: t("aging31"), amount: Number(arTotals?.aging_31_60 ?? 0), tone: "bg-warning" },
		{ label: t("aging60"), amount: Number(arTotals?.aging_60_plus ?? 0), tone: "bg-danger" },
	];

	// Invoice status breakdown — pre-computed server-side
	type StatusRow = { status: string; inv_count: number; total_amount: number };
	const groups = (statusBreakdown ?? []) as StatusRow[];
	const STATUS_DOT: Record<string, string> = {
		draft: "bg-ink-faint",
		sent: "bg-primary",
		partially_paid: "bg-warning",
		paid: "bg-success",
		overdue: "bg-danger",
	};

	return (
		<div className="space-y-5">
			<PageHeader
				title={t("title")}
				subtitle={t("subtitle")}
				actions={<MonthPicker value={selectedMonth} />}
			/>

			{/* KPI stats */}
			<div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
				<Stat
					icon={<Wallet size={16} />}
					tone={overdueCount > 0 ? "pending" : "neutral"}
					label={t("outstanding")}
					value={formatRupiah(totalOutstanding)}
					sub={t("outstandingSub", { count: outstandingCount })}
					href="/invoices"
				/>
				<Stat
					icon={<AlertTriangle size={16} />}
					tone={overdueAmount > 0 ? "danger" : "neutral"}
					label={t("overdue")}
					value={formatRupiah(overdueAmount)}
					sub={t("overdueSub")}
					href="/invoices?status=overdue"
				/>
				<Stat
					icon={<Banknote size={16} />}
					tone="positive"
					label={t("cashIn")}
					value={formatRupiah(cashIn)}
					sub={t("cashInSub")}
				/>
				<Stat
					icon={<TrendingUp size={16} />}
					tone={jobGrossProfit >= 0 ? "positive" : "danger"}
					label={t("jobGrossProfit")}
					value={formatRupiah(jobGrossProfit)}
					sub={t("jobGrossProfitSub")}
					href="/reports"
				/>
				<Stat
					icon={<TrendingUp size={16} />}
					tone={operatingProfit >= 0 ? "positive" : "danger"}
					label={t("operatingProfit")}
					value={formatRupiah(operatingProfit)}
					sub={t("operatingProfitSub", { amount: formatRupiah(operationalTotal) })}
					href="/expenses"
				/>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
				{/* Recent payments */}
				<Card>
					<CardHeader title={t("recentPayments")} />
					<div className="p-5">
						{payments.length === 0 ? (
							<EmptyState title={t("noPayments")} className="py-4" />
						) : (
							<ul className="space-y-1">
								{payments.map((p) => {
									// Route to the invoice the payment settled; fall back to the job.
									const href = p.invoice_id
										? `/invoices/${p.invoice_id}`
										: p.jobs
											? `/jobs/${p.jobs.id}`
											: null;
									const row = (
										<>
											<span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-bg shrink-0">
												<Banknote size={13} className="text-success" aria-hidden="true" />
											</span>
											<div className="flex-1 min-w-0">
												<Money value={p.amount} className="text-[13px] font-semibold" />
												<p className="text-xs text-ink-faint truncate">
													{p.invoices?.invoice_number ?? p.jobs?.job_number ?? "—"}
													{p.invoices?.label ? ` (${p.invoices.label})` : ""}
													{p.method ? ` · ${p.method}` : ""}
												</p>
											</div>
											<span className="text-xs text-ink-faint shrink-0 tabular-nums">
												{p.paid_at ? formatDate(p.paid_at) : "—"}
											</span>
										</>
									);
									return (
										<li key={p.id}>
											{href ? (
												<Link
													href={href}
													className="flex items-center gap-3 text-sm -mx-2 px-2 py-1.5 rounded-lg hover:bg-surface-sunken transition-colors"
												>
													{row}
												</Link>
											) : (
												<div className="flex items-center gap-3 text-sm px-2 py-1.5">{row}</div>
											)}
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</Card>

				{/* Recent expenses */}
				<Card>
					<CardHeader
						title={t("recentExpenses")}
						action={
							<Link
								href="/expenses"
								className="text-xs font-semibold text-primary-text hover:underline"
							>
								{t("viewExpenses")}
							</Link>
						}
					/>
					<div className="p-5">
						{expenses.length === 0 ? (
							<EmptyState title={t("noExpenses")} className="py-4" />
						) : (
							<ul className="space-y-1">
								{expenses.map((e) => {
									// Job expenses live under the job; operational ones on the expenses page.
									const href =
										e.expense_type === "job" && e.job_id
											? `/jobs/${e.job_id}/expenses`
											: "/expenses";
									return (
										<li key={e.id}>
											<Link
												href={href}
												className="flex items-center gap-3 text-sm -mx-2 px-2 py-1.5 rounded-lg hover:bg-surface-sunken transition-colors"
											>
												<span className="flex h-7 w-7 items-center justify-center rounded-full bg-danger-bg shrink-0">
													<Receipt size={13} className="text-danger" aria-hidden="true" />
												</span>
												<div className="flex-1 min-w-0">
													<Money value={e.amount} className="text-[13px] font-semibold" />
													<p className="text-xs text-ink-faint truncate">
														{e.category}
														{e.jobs?.job_number ? ` · ${e.jobs.job_number}` : ""}
														{e.description ? ` · ${e.description}` : ""}
													</p>
												</div>
												<span className="text-xs text-ink-faint shrink-0 tabular-nums">
													{formatDate(e.incurred_at)}
												</span>
											</Link>
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</Card>

				{/* AR aging */}
				<Card>
					<CardHeader
						title={t("arAging")}
						action={
							<Link
								href="/invoices"
								className="text-xs font-semibold text-primary-text hover:underline"
							>
								{t("viewInvoices")}
							</Link>
						}
					/>
					<div className="p-5">
						{totalOutstanding === 0 ? (
							<EmptyState title={t("noOutstanding")} className="py-4" />
						) : (
							<div className="space-y-3">
								{agingRows.map((row) => {
									const pct = totalOutstanding
										? Math.round((row.amount / totalOutstanding) * 100)
										: 0;
									return (
										<div key={row.label}>
											<div className="flex justify-between text-sm mb-1">
												<span className="text-ink-muted">{row.label}</span>
												<span className="tabular-nums font-medium text-ink">
													{formatRupiah(row.amount)}
												</span>
											</div>
											<div className="h-1.5 rounded-full bg-subtle overflow-hidden">
												<div
													className={`h-full rounded-full ${row.tone}`}
													style={{ width: `${pct}%` }}
												/>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</Card>

				{/* Invoice status breakdown */}
				<Card>
					<CardHeader title={t("invoiceStatus")} />
					<div className="p-5">
						{groups.length === 0 ? (
							<EmptyState title={t("noInvoices")} className="py-4" />
						) : (
							<div className="space-y-2.5">
								{groups.map((row) => (
									<div key={row.status} className="flex items-center gap-3 text-sm">
										<span
											className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_DOT[row.status] ?? "bg-ink-faint"}`}
											aria-hidden="true"
										/>
										<span className="flex-1 text-ink-muted capitalize">
											{tInv(row.status as never)} ({row.inv_count})
										</span>
										<span className="tabular-nums font-medium text-ink">
											{formatRupiah(row.total_amount)}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				</Card>
			</div>
		</div>
	);
}
