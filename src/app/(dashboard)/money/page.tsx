import { AlertTriangle, Banknote, TrendingUp, Wallet } from "lucide-react";
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
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRupiah } from "@/lib/utils";

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

const DAY = 86_400_000;

type InvRow = {
	id: string;
	invoice_number: string;
	total_amount: number;
	paid_amount: number;
	due_date: string | null;
	status: string;
};
type Payment = {
	id: string;
	amount: number;
	paid_at: string | null;
	method: string | null;
	jobs: {
		job_number: string;
		invoices: { invoice_number: string }[];
	} | null;
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
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const [
		{ data: outstandingData },
		{ data: monthlyPayments },
		{ data: monthlyExp },
		{ data: paymentsData },
		{ data: invForStatus },
	] = await Promise.all([
		supabase
			.from("invoices")
			.select("id, invoice_number, total_amount, paid_amount, due_date, status")
			.neq("status", "paid")
			.neq("status", "cancelled")
			.limit(200),
		// Actual cash received: payments made in this month
		supabase.from("payments").select("amount").gte("paid_at", monthStart).lt("paid_at", monthEnd),
		supabase
			.from("expenses")
			.select("amount")
			.gte("incurred_at", monthStart)
			.lt("incurred_at", monthEnd),
		// Recent payments in the selected month
		supabase
			.from("payments")
			.select("id, amount, paid_at, method, jobs(job_number, invoices(invoice_number))")
			.gte("paid_at", monthStart)
			.lt("paid_at", monthEnd)
			.order("paid_at", { ascending: false })
			.limit(8),
		supabase.from("invoices").select("status, total_amount").neq("status", "cancelled").limit(200),
	]);

	const invRows = (outstandingData ?? []) as InvRow[];
	const payments = (paymentsData ?? []) as Payment[];

	const outstanding = invRows
		.map((i) => ({
			...i,
			outstanding: (i.total_amount ?? 0) - (i.paid_amount ?? 0),
		}))
		.filter((i) => i.outstanding > 0);

	const totalOutstanding = outstanding.reduce((s, i) => s + i.outstanding, 0);
	const overdue = outstanding.filter(
		(i) => i.due_date && new Date(`${i.due_date}T00:00:00`) < today,
	);
	const overdueAmount = overdue.reduce((s, i) => s + i.outstanding, 0);
	const monthRevenue = (monthlyPayments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
	const monthExpenses = (monthlyExp ?? []).reduce((s, i) => s + (i.amount ?? 0), 0);
	const net = monthRevenue - monthExpenses;

	// AR aging buckets
	const aging = { current: 0, b1: 0, b31: 0, b60: 0 };
	for (const inv of outstanding) {
		const amt = inv.outstanding ?? 0;
		if (!inv.due_date) {
			aging.current += amt;
			continue;
		}
		const days = Math.floor(
			(today.getTime() - new Date(`${inv.due_date}T00:00:00`).getTime()) / DAY,
		);
		if (days <= 0) aging.current += amt;
		else if (days <= 30) aging.b1 += amt;
		else if (days <= 60) aging.b31 += amt;
		else aging.b60 += amt;
	}
	const agingRows: { label: string; amount: number; tone: string }[] = [
		{ label: t("agingCurrent"), amount: aging.current, tone: "bg-ink-faint" },
		{ label: t("aging1"), amount: aging.b1, tone: "bg-warning" },
		{ label: t("aging31"), amount: aging.b31, tone: "bg-warning" },
		{ label: t("aging60"), amount: aging.b60, tone: "bg-danger" },
	];

	// Invoice status breakdown
	const groups: Record<string, { count: number; total: number }> = {};
	for (const inv of invForStatus ?? []) {
		groups[inv.status] ??= { count: 0, total: 0 };
		groups[inv.status].count++;
		groups[inv.status].total += inv.total_amount ?? 0;
	}
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
			<div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
				<Stat
					icon={<Wallet size={16} />}
					tone={overdue.length > 0 ? "pending" : "neutral"}
					label={t("outstanding")}
					value={formatRupiah(totalOutstanding)}
					sub={t("outstandingSub", { count: outstanding.length })}
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
					value={formatRupiah(monthRevenue)}
					sub={t("cashInSub")}
				/>
				<Stat
					icon={<TrendingUp size={16} />}
					tone={net >= 0 ? "positive" : "danger"}
					label={t("net")}
					value={formatRupiah(net)}
					sub={t("netSub")}
					href="/reports"
				/>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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

				{/* Recent payments */}
				<Card>
					<CardHeader title={t("recentPayments")} />
					<div className="p-5">
						{payments.length === 0 ? (
							<EmptyState title={t("noPayments")} className="py-4" />
						) : (
							<ul className="space-y-3">
								{payments.map((p) => (
									<li key={p.id} className="flex items-center gap-3 text-sm">
										<span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-bg shrink-0">
											<Banknote size={13} className="text-success" aria-hidden="true" />
										</span>
										<div className="flex-1 min-w-0">
											<Money value={p.amount} className="text-[13px] font-semibold" />
											<p className="text-xs text-ink-faint truncate">
												{p.jobs?.invoices?.[0]?.invoice_number ?? p.jobs?.job_number ?? "—"}
												{p.method ? ` · ${p.method}` : ""}
											</p>
										</div>
										<span className="text-xs text-ink-faint shrink-0 tabular-nums">
											{p.paid_at ? formatDate(p.paid_at) : "—"}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
				</Card>
			</div>

			{/* Invoice status breakdown */}
			<Card>
				<CardHeader title={t("invoiceStatus")} />
				<div className="p-5">
					{Object.keys(groups).length === 0 ? (
						<EmptyState title={t("noInvoices")} className="py-4" />
					) : (
						<div className="space-y-2.5">
							{Object.entries(groups).map(([status, { count, total }]) => (
								<div key={status} className="flex items-center gap-3 text-sm">
									<span
										className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_DOT[status] ?? "bg-ink-faint"}`}
										aria-hidden="true"
									/>
									<span className="flex-1 text-ink-muted capitalize">
										{tInv(status as never)} ({count})
									</span>
									<span className="tabular-nums font-medium text-ink">{formatRupiah(total)}</span>
								</div>
							))}
						</div>
					)}
				</div>
			</Card>
		</div>
	);
}
