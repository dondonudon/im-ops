import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatDate, formatRupiah } from "@/lib/utils";
import {
	StatusChip,
	leadStatusVariant,
	jobStatusVariant,
} from "@/components/shared/StatusChip";

/**
 * Customer detail page — history of leads, jobs, invoices.
 */
export default async function CustomerDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.customerDetail");
	const tType = await getTranslations("entity.customerType");
	const tCommon = await getTranslations("common.buttons");
	const tLeadStatus = await getTranslations("status.lead");
	const tJobStatus = await getTranslations("status.job");

	const [{ data: customer }, { data: leads }, { data: jobs }] =
		await Promise.all([
			supabase.from("customers").select("*").eq("id", id).single(),
			supabase
				.from("leads")
				.select("id, status, pickup_address, destination_address, created_at")
				.eq("customer_id", id)
				.order("created_at", { ascending: false }),
			supabase
				.from("jobs")
				.select(
					"id, job_number, status, move_date, revenue, proposals!inner(lead_id, leads!inner(customer_id))",
				)
				.eq("proposals.leads.customer_id", id)
				.order("created_at", { ascending: false }),
		]);

	if (!customer) notFound();

	return (
		<div className="space-y-8">
			<div className="flex items-start justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
						{customer.name}
					</h1>
					<p className="text-sm text-gray-500 dark:text-gray-400">
						{tType(customer.type as never)}
					</p>
				</div>
				<Link
					href={`/customers/${id}/edit`}
					className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
				>
					{tCommon("edit")}
				</Link>
			</div>

			{/* Contact info */}
			<section
				aria-label={t("contactInformation")}
				className="grid grid-cols-2 gap-4 text-sm"
			>
				{customer.phone && (
					<div>
						<p className="text-gray-500 dark:text-gray-400">{t("phone")}</p>
						<p className="font-medium">{customer.phone}</p>
					</div>
				)}
				{customer.email && (
					<div>
						<p className="text-gray-500 dark:text-gray-400">{t("email")}</p>
						<p className="font-medium">{customer.email}</p>
					</div>
				)}
				{customer.company_name && (
					<div>
						<p className="text-gray-500 dark:text-gray-400">{t("company")}</p>
						<p className="font-medium">{customer.company_name}</p>
					</div>
				)}
				<div>
					<p className="text-gray-500 dark:text-gray-400">{t("since")}</p>
					<p className="font-medium">{formatDate(customer.created_at)}</p>
				</div>
			</section>

			{/* Leads */}
			<section>
				<div className="flex items-center justify-between mb-3">
					<h2 className="text-lg font-semibold text-gray-900 dark:text-white">
						{t("leads")}
					</h2>
					<Link
						href={`/leads/new?customer_id=${id}`}
						className="text-sm text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
					>
						+ {t("newLead")}
					</Link>
				</div>
				{(leads ?? []).length === 0 ? (
					<p className="text-sm text-gray-400">{t("noLeadsYet")}</p>
				) : (
					<ul className="space-y-2">
						{leads!.map((l) => (
							<li key={l.id}>
								<Link
									href={`/leads/${l.id}`}
									className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
								>
									<span className="text-sm font-medium truncate max-w-xs">
										{l.pickup_address ?? "—"} → {l.destination_address ?? "—"}
									</span>
									<div className="flex items-center gap-3">
										<StatusChip
											label={tLeadStatus(l.status as never)}
											variant={leadStatusVariant(l.status)}
										/>
										<span className="text-xs text-gray-400">
											{formatDate(l.created_at)}
										</span>
									</div>
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* Jobs */}
			<section>
				<h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
					{t("jobs")}
				</h2>
				{(jobs ?? []).length === 0 ? (
					<p className="text-sm text-gray-400">{t("noJobsYet")}</p>
				) : (
					<ul className="space-y-2">
						{jobs!.map((j) => (
							<li key={j.id}>
								<Link
									href={`/jobs/${j.id}`}
									className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
								>
									<span className="text-sm font-medium">{j.job_number}</span>
									<div className="flex items-center gap-3">
										<span className="text-sm">{formatRupiah(j.revenue)}</span>
										<StatusChip
											label={tJobStatus(j.status as never)}
											variant={jobStatusVariant(j.status)}
										/>
										<span className="text-xs text-gray-400">
											{formatDate(j.move_date)}
										</span>
									</div>
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
