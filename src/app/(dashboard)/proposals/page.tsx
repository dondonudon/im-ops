import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatDate, formatRupiah } from "@/lib/utils";
import {
	StatusChip,
	proposalStatusVariant,
} from "@/components/shared/StatusChip";

const STATUS_OPTS = [
	"",
	"draft",
	"sent",
	"negotiating",
	"approved",
	"lost",
	"expired",
] as const;

export default async function ProposalsPage({
	searchParams,
}: {
	searchParams: Promise<{ status?: string }>;
}) {
	const { status } = await searchParams;
	const supabase = await createClient();
	const t = await getTranslations("pages.proposals");
	const tStatus = await getTranslations("status.proposal");

	let query = supabase
		.from("proposals")
		.select(`
      id, proposal_number, status, final_price, created_at,
      leads(customer_id, customers(name))
    `)
		.order("created_at", { ascending: false });

	if (status) query = query.filter("status", "eq", status);

	const { data: proposals } = await query;

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
								{t("columns.proposalNumber")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.customer")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.price")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.status")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.created")}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
						{(proposals ?? []).map((p) => {
							const customer = (
								p.leads as { customers: { name: string } | null } | null
							)?.customers;
							return (
								<tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
									<td className="px-4 py-3 font-mono text-xs">
										<Link
											href={`/proposals/${p.id}`}
											className="text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
										>
											{p.proposal_number}
										</Link>
									</td>
									<td className="px-4 py-3">{customer?.name ?? "—"}</td>
									<td className="px-4 py-3 tabular-nums">
										{p.final_price ? formatRupiah(p.final_price) : "—"}
									</td>
									<td className="px-4 py-3">
										<StatusChip
											label={tStatus(p.status as never)}
											variant={proposalStatusVariant(p.status)}
										/>
									</td>
									<td className="px-4 py-3 text-gray-500">
										{formatDate(p.created_at)}
									</td>
								</tr>
							);
						})}
						{(proposals ?? []).length === 0 && (
							<tr>
								<td colSpan={5} className="px-4 py-8 text-center text-gray-400">
									{t("empty")}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Mobile cards */}
			<div className="md:hidden space-y-3">
				{(proposals ?? []).map((p) => {
					const customer = (
						p.leads as { customers: { name: string } | null } | null
					)?.customers;
					return (
						<Link
							key={p.id}
							href={`/proposals/${p.id}`}
							className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
						>
							<div className="flex items-start justify-between mb-2">
								<div>
									<p className="font-mono text-xs text-gray-400">
										{p.proposal_number}
									</p>
									<p className="font-semibold text-gray-900 mt-0.5">
										{customer?.name ?? "—"}
									</p>
								</div>
								<StatusChip
									label={tStatus(p.status as never)}
									variant={proposalStatusVariant(p.status)}
								/>
							</div>
							<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
								<div>
									<p className="text-xs text-gray-400">{t("columns.price")}</p>
									<p className="font-semibold text-gray-900 tabular-nums">
										{p.final_price ? formatRupiah(p.final_price) : "—"}
									</p>
								</div>
								<div>
									<p className="text-xs text-gray-400">{t("columns.created")}</p>
									<p className="text-gray-700">{formatDate(p.created_at)}</p>
								</div>
							</div>
						</Link>
					);
				})}
				{(proposals ?? []).length === 0 && (
					<p className="py-10 text-center text-sm text-gray-400">{t("empty")}</p>
				)}
			</div>
		</div>
	);
}
