import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BackLink } from "@/components/shared/BackLink";
import { PendingLink } from "@/components/shared/PendingLink";
import { jobStatusVariant, leadStatusVariant, StatusChip } from "@/components/shared/StatusChip";
import { buttonStyles, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatCustomerName, formatDate, formatRupiah } from "@/lib/utils";

/**
 * Customer detail page — history of leads, jobs, invoices.
 */
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.customerDetail");
	const tType = await getTranslations("entity.customerType");
	const tCommon = await getTranslations("common.buttons");
	const tLeadStatus = await getTranslations("status.lead");
	const tJobStatus = await getTranslations("status.job");

	const [{ data: customer }, { data: leads }, { data: jobs }] = await Promise.all([
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
			<BackLink href="/customers" label={t("backToList")} />
			<PageHeader
				title={formatCustomerName(customer.prefix, customer.name)}
				subtitle={tType(customer.type as never)}
				actions={
					<Link href={`/customers/${id}/edit`} className={buttonStyles({ variant: "secondary" })}>
						{tCommon("edit")}
					</Link>
				}
			/>

			{/* Contact info */}
			<section aria-label={t("contactInformation")} className="grid grid-cols-2 gap-4 text-sm">
				{customer.phone && (
					<div>
						<p className="text-ink-muted">{t("phone")}</p>
						<p className="font-medium text-ink">{customer.phone}</p>
					</div>
				)}
				{customer.email && (
					<div>
						<p className="text-ink-muted">{t("email")}</p>
						<p className="font-medium text-ink">{customer.email}</p>
					</div>
				)}
				{customer.company_name && (
					<div>
						<p className="text-ink-muted">{t("company")}</p>
						<p className="font-medium text-ink">{customer.company_name}</p>
					</div>
				)}
				<div>
					<p className="text-ink-muted">{t("since")}</p>
					<p className="font-medium text-ink">{formatDate(customer.created_at)}</p>
				</div>
			</section>

			{/* Leads */}
			<section>
				<div className="flex items-center justify-between mb-3">
					<h2 className="text-lg font-semibold text-ink">{t("leads")}</h2>
					<Link
						href={`/leads/new?customer_id=${id}`}
						className="text-sm text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
					>
						+ {t("newLead")}
					</Link>
				</div>
				{(leads ?? []).length === 0 ? (
					<p className="text-sm text-ink-faint">{t("noLeadsYet")}</p>
				) : (
					<ul className="space-y-2">
						{leads!.map((l) => (
							<li key={l.id}>
								<PendingLink
									href={`/leads/${l.id}`}
									className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 hover:bg-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
								>
									<span className="text-sm font-medium text-ink truncate max-w-xs">
										{l.pickup_address ?? "—"} → {l.destination_address ?? "—"}
									</span>
									<div className="flex items-center gap-3">
										<StatusChip
											label={tLeadStatus(l.status as never)}
											variant={leadStatusVariant(l.status)}
										/>
										<span className="text-xs text-ink-faint">{formatDate(l.created_at)}</span>
									</div>
								</PendingLink>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* Jobs */}
			<section>
				<h2 className="text-lg font-semibold text-ink mb-3">{t("jobs")}</h2>
				{(jobs ?? []).length === 0 ? (
					<p className="text-sm text-ink-faint">{t("noJobsYet")}</p>
				) : (
					<ul className="space-y-2">
						{jobs!.map((j) => (
							<li key={j.id}>
								<PendingLink
									href={`/jobs/${j.id}`}
									className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 hover:bg-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
								>
									<span className="text-sm font-medium text-ink">{j.job_number}</span>
									<div className="flex items-center gap-3">
										<span className="text-sm text-ink-muted">{formatRupiah(j.revenue)}</span>
										<StatusChip
											label={tJobStatus(j.status as never)}
											variant={jobStatusVariant(j.status)}
										/>
										<span className="text-xs text-ink-faint">{formatDate(j.move_date)}</span>
									</div>
								</PendingLink>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
