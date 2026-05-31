import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatDate, formatRupiah } from "@/lib/utils";
import { StatusChip, invoiceStatusVariant } from "@/components/shared/StatusChip";

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
	searchParams: Promise<{ status?: string }>;
}) {
	const { status } = await searchParams;
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
    `)
		.order("created_at", { ascending: false });

	if (status) query = query.filter("status", "eq", status);

	const { data: invoices } = await query;

	return (
		<div className="space-y-5">
			<h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
				{t("title")}
			</h1>

			<form method="GET" role="search">
				<select
					name="status"
					defaultValue={status ?? ""}
					aria-label={t("columns.status")}
					className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
				>
					{STATUS_OPTS.map((s) => (
						<option key={s} value={s}>
							{s === "" ? t("filterAll") : tStatus(s as never)}
						</option>
					))}
				</select>
			</form>

			{/* Desktop table */}
			<div className="hidden md:block rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-x-auto">
				<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
					<thead className="bg-gray-50 dark:bg-gray-800">
						<tr>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.invoiceNumber")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.customer")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.total")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.paid")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.dueDate")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.status")}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
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
								<tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
									<td className="px-4 py-3 font-mono text-xs">
										<Link
											href={`/invoices/${inv.id}`}
											className="text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
										>
											{inv.invoice_number}
										</Link>
									</td>
									<td className="px-4 py-3">{customerName}</td>
									<td className="px-4 py-3 tabular-nums">
										{formatRupiah(inv.total_amount)}
									</td>
									<td className="px-4 py-3 tabular-nums text-green-600">
										{formatRupiah(inv.paid_amount ?? 0)}
									</td>
									<td className="px-4 py-3 text-gray-500">
										{inv.due_date ? formatDate(inv.due_date) : "—"}
									</td>
									<td className="px-4 py-3">
										<StatusChip
											label={tStatus(inv.status as never)}
											variant={invoiceStatusVariant(inv.status)}
										/>
									</td>
								</tr>
							);
						})}
						{(invoices ?? []).length === 0 && (
							<tr>
								<td colSpan={6} className="px-4 py-8 text-center text-gray-400">
									{t("empty")}
								</td>
							</tr>
						)}
					</tbody>
				</table>
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
							className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
						>
							<div className="flex items-start justify-between mb-2">
								<div>
									<p className="font-mono text-xs text-gray-400">
										{inv.invoice_number}
									</p>
									<p className="font-semibold text-gray-900 mt-0.5">
										{customerName}
									</p>
								</div>
								<StatusChip
									label={tStatus(inv.status as never)}
									variant={invoiceStatusVariant(inv.status)}
								/>
							</div>
							<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
								<div>
									<p className="text-xs text-gray-400">{t("columns.total")}</p>
									<p className="font-semibold text-gray-900 tabular-nums">
										{formatRupiah(inv.total_amount)}
									</p>
								</div>
								<div>
									<p className="text-xs text-gray-400">{t("columns.paid")}</p>
									<p
										className={`font-semibold tabular-nums ${balance > 0 ? "text-red-600" : "text-green-600"}`}
									>
										{formatRupiah(balance)}
									</p>
								</div>
								{inv.due_date && (
									<div className="col-span-2">
										<p className="text-xs text-gray-400">
											{tDetail("due", { date: formatDate(inv.due_date) })}
										</p>
									</div>
								)}
							</div>
						</Link>
					);
				})}
				{(invoices ?? []).length === 0 && (
					<p className="py-10 text-center text-sm text-gray-400">{t("empty")}</p>
				)}
			</div>
		</div>
	);
}
