import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatDate, formatRupiah } from "@/lib/utils";
import { StatusChip, invoiceStatusVariant } from "@/components/shared/StatusChip";
import {
	PageHeader,
	Select,
	Table,
	THead,
	TH,
	TBody,
	TR,
	TD,
	EmptyState,
	Badge,
	toneFor,
	Money,
	Pagination,
} from "@/components/ui";

const PAGE_SIZE = 25;

const STATUS_OPTS = [
	"",
	"draft",
	"sent",
	"partially_paid",
	"paid",
	"overdue",
	"cancelled",
] as const;

export default async function InvoicesPage({
	searchParams,
}: {
	searchParams: Promise<{ status?: string; page?: string }>;
}) {
	const { status, page: rawPage } = await searchParams;
	const page = Math.max(1, Number(rawPage) || 1);
	const from = (page - 1) * PAGE_SIZE;
	const supabase = await createClient();
	const t = await getTranslations("pages.invoices");
	const tStatus = await getTranslations("status.invoice");
	const tDetail = await getTranslations("pages.invoiceDetail");

	let query = supabase
		.from("invoices")
		.select(`
      id, invoice_number, status, total_amount, paid_amount, due_date, created_at,
      jobs(
        job_number,
        proposals(leads(customers(name)))
      )
    `, { count: "exact" });

	if (status) query = query.filter("status", "eq", status);

	const { data: invoices, count } = await query
		.order("created_at", { ascending: false })
		.range(from, from + PAGE_SIZE - 1);

	return (
		<div className="space-y-5">
			<PageHeader title={t("title")} />

			<form method="GET" role="search">
				<Select
					name="status"
					defaultValue={status ?? ""}
					aria-label={t("columns.status")}
					className="w-auto"
				>
					{STATUS_OPTS.map((s) => (
						<option key={s} value={s}>
							{s === "" ? t("filterAll") : tStatus(s as never)}
						</option>
					))}
				</Select>
			</form>

			{/* Desktop table */}
			<div className="hidden md:block">
				<Table>
					<THead>
						<TH>{t("columns.invoiceNumber")}</TH>
						<TH>{t("columns.customer")}</TH>
						<TH align="right">{t("columns.total")}</TH>
						<TH align="right">{t("columns.paid")}</TH>
						<TH>{t("columns.dueDate")}</TH>
						<TH>{t("columns.status")}</TH>
					</THead>
					<TBody>
						{(invoices ?? []).map((inv) => {
							const customerName =
								(
									inv.jobs as {
										proposals: {
											leads: { customers: { name: string } | null } | null;
										} | null;
									} | null
								)?.proposals?.leads?.customers?.name ?? "—";
							return (
								<TR key={inv.id}>
									<TD className="font-mono text-xs">
										<Link
											href={`/invoices/${inv.id}`}
											className="text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
										>
											{inv.invoice_number}
										</Link>
									</TD>
									<TD>{customerName}</TD>
									<TD align="right">
										<Money value={inv.total_amount} />
									</TD>
									<TD align="right">
										<Money value={inv.paid_amount ?? 0} tone="positive" />
									</TD>
									<TD className="text-ink-muted">
										{inv.due_date ? formatDate(inv.due_date) : "—"}
									</TD>
									<TD>
										<Badge tone={toneFor("invoice", inv.status)} dot>
											{tStatus(inv.status as never)}
										</Badge>
									</TD>
								</TR>
							);
						})}
						{(invoices ?? []).length === 0 && (
							<tr>
								<td colSpan={6}>
									<EmptyState title={t("empty")} />
								</td>
							</tr>
						)}
					</TBody>
				</Table>
			</div>

			{/* Mobile cards */}
			<div className="md:hidden space-y-3">
				{(invoices ?? []).map((inv) => {
					const customerName =
						(
							inv.jobs as {
								proposals: {
									leads: { customers: { name: string } | null } | null;
								} | null;
							} | null
						)?.proposals?.leads?.customers?.name ?? "—";
					const balance = inv.total_amount - (inv.paid_amount ?? 0);
					return (
						<Link
							key={inv.id}
							href={`/invoices/${inv.id}`}
							className="block bg-surface rounded-xl border border-line p-4 shadow-token active:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
						>
							<div className="flex items-start justify-between mb-2">
								<div>
									<p className="font-mono text-xs text-ink-faint">
										{inv.invoice_number}
									</p>
									<p className="font-semibold text-ink mt-0.5">
										{customerName}
									</p>
								</div>
								<Badge tone={toneFor("invoice", inv.status)} dot>
									{tStatus(inv.status as never)}
								</Badge>
							</div>
							<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
								<div>
									<p className="text-xs text-ink-faint">{t("columns.total")}</p>
									<p className="font-semibold text-ink tabular-nums">
										{formatRupiah(inv.total_amount)}
									</p>
								</div>
								<div>
									<p className="text-xs text-ink-faint">{t("columns.paid")}</p>
									<Money
										value={balance}
										tone={balance > 0 ? "danger" : "positive"}
										className="font-semibold"
									/>
								</div>
								{inv.due_date && (
									<div className="col-span-2">
										<p className="text-xs text-ink-faint">
											{tDetail("due", { date: formatDate(inv.due_date) })}
										</p>
									</div>
								)}
							</div>
						</Link>
					);
				})}
				{(invoices ?? []).length === 0 && (
					<p className="py-10 text-center text-sm text-ink-faint">{t("empty")}</p>
				)}
			</div>

			<Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
		</div>
	);
}
