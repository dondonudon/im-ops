import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GenerateInvoiceButton } from "@/components/invoices/GenerateInvoiceButton";
import { PaymentsPanel } from "@/components/invoices/PaymentsPanel";
import { JobCancelButton } from "@/components/jobs/JobCancelButton";
import { JobMediaPanel } from "@/components/jobs/JobMediaPanel";
import { TimelineLogEventButton } from "@/components/jobs/TimelineLogEventButton";
import { BackLink } from "@/components/shared/BackLink";
import { GCalRetryButton } from "@/components/shared/GCalRetryButton";
import { Badge, buttonStyles, Card, CardHeader, PageHeader, toneFor } from "@/components/ui";
import {
	buildCompanySettings,
	buildInvoiceTemplateSettings,
	resolveLogoDataUrl,
} from "@/lib/pdfSettings";
import { createClient } from "@/lib/supabase/server";
import { deriveJobStatus, formatDate, formatJobSchedule, formatRupiah } from "@/lib/utils";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.jobDetail");
	const tStatus = await getTranslations("status.job");
	const tCommon = await getTranslations("common.buttons");
	const tLabels = await getTranslations("common.labels");
	const tAssign = await getTranslations("panels.assignments");
	const tPay = await getTranslations("panels.payments");
	const tCategory = await getTranslations("entity.expenseCategory");

	// Phase 1: job + settings fetched in parallel.
	const [{ data: job }, { data: settingsRows }] = await Promise.all([
		supabase
			.from("jobs")
			.select(`
        *,
        proposals(
          id, proposal_number, final_price,
          leads(
            pickup_address, destination_address, destination_address_2,
            customers(id, name, phone)
          )
        )
      `)
			.eq("id", id)
			.single(),
		supabase
			.from("system_settings")
			.select("key, value")
			.in("key", [
				"company_name",
				"company_tagline",
				"company_logo_url",
				"company_address",
				"company_phone",
				"company_website",
				"company_city",
				"invoice_signature_name",
				"invoice_signature_role",
			]),
	]);

	if (!job) notFound();

	const settingsMap = Object.fromEntries((settingsRows ?? []).map((s) => [s.key, s.value]));
	const logoUrl = settingsMap.company_logo_url ?? "";
	const proposalId = (job.proposals as { id: string } | null)?.id ?? null;

	// Phase 2: remaining queries + logo resolution all in parallel.
	const [
		{ data: estimation },
		{ data: assignments },
		{ data: expenses },
		{ data: timeline },
		{ data: invoice },
		{ data: payments },
		{ data: jobMedia },
		logoDataUrl,
	] = await Promise.all([
		proposalId
			? supabase
					.from("estimations")
					.select("id, outputs, inputs")
					.eq("proposal_id", proposalId)
					.maybeSingle()
			: Promise.resolve({ data: null, error: null }),
		supabase
			.from("job_assignments")
			.select(
				"id, assignment_type, fleet_id, crew_id, role, daily_rate, days, fleet(name), crew(name)",
			)
			.eq("job_id", id),
		supabase
			.from("expenses")
			.select("id, category, description, amount, incurred_at")
			.eq("job_id", id)
			.order("incurred_at", { ascending: false }),
		supabase
			.from("job_timeline")
			.select("id, event_type, notes, occurred_at")
			.eq("job_id", id)
			.order("occurred_at"),
		supabase
			.from("invoices")
			.select("id, invoice_number, status, total_amount, paid_amount")
			.eq("job_id", id)
			.maybeSingle(),
		supabase
			.from("payments")
			.select("id, payment_type, method, amount, paid_at, notes")
			.eq("job_id", id)
			.order("paid_at"),
		supabase
			.from("job_media")
			.select("id, media_type, storage_path, file_name, caption, uploaded_at")
			.eq("job_id", id)
			.order("uploaded_at"),
		resolveLogoDataUrl(logoUrl),
	]);

	const pdfCompany = buildCompanySettings(settingsMap);
	pdfCompany.logo = logoDataUrl;
	const pdfTemplate = buildInvoiceTemplateSettings(settingsMap);

	const proposal = job.proposals as {
		id: string;
		proposal_number: string;
		final_price: number | null;
		leads: {
			pickup_address: string | null;
			destination_address: string | null;
			destination_address_2: string | null;
			customers: { id: string; name: string; phone: string | null } | null;
		} | null;
	} | null;

	const estimationOutputs = (estimation?.outputs ?? {}) as Record<string, number>;

	const customer = proposal?.leads?.customers ?? null;
	const totalExpenses = (expenses ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);
	const profit = (job.revenue ?? 0) - totalExpenses;
	const derivedStatus = deriveJobStatus(job.move_date, job.status);

	return (
		<div className="space-y-6">
			<BackLink href="/jobs" label={t("backToList")} />
			{/* Header */}
			<PageHeader
				title={
					<span className="flex items-center gap-3">
						<span className="font-mono">{job.job_number}</span>
						<Badge tone={toneFor("job", derivedStatus)} dot>
							{tStatus(derivedStatus as never)}
						</Badge>
					</span>
				}
				subtitle={
					<>
						{customer?.name ?? "—"} ·{" "}
						{job.move_date
							? formatJobSchedule(
									job.move_date,
									(job as { move_time?: string | null }).move_time,
									(job as { move_end_date?: string | null }).move_end_date,
								)
							: tLabels("dateTbd")}
						{proposal && (
							<>
								{" "}
								·{" "}
								<Link
									href={`/proposals/${proposal.id}`}
									className="text-primary-text hover:underline"
								>
									{proposal.proposal_number}
								</Link>
							</>
						)}
					</>
				}
				actions={
					<div className="flex items-center gap-2 flex-wrap">
						<Link
							href={`/jobs/${id}/edit`}
							className={buttonStyles({ variant: "secondary", size: "sm" })}
						>
							<Pencil size={14} aria-hidden="true" />
							{tCommon("edit")}
						</Link>
						<GCalRetryButton kind="job" id={id} hasEvent={Boolean(job.gcal_event_id)} />
						{derivedStatus !== "cancelled" && (
							<JobCancelButton jobId={id} payments={payments ?? []} />
						)}
						<JobStatusActions jobId={id} derivedStatus={derivedStatus} />
					</div>
				}
			/>

			<div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
				{/* Left: details */}
				<div className="xl:col-span-2 space-y-6">
					{/* Move summary */}
					{proposal?.leads && (
						<Card className="p-5 grid grid-cols-2 gap-4 text-sm">
							<div>
								<p className="text-ink-muted">{t("pickup")}</p>
								<p className="font-medium mt-0.5">{proposal.leads.pickup_address ?? "—"}</p>
							</div>
							<div>
								<p className="text-ink-muted">{t("destination")}</p>
								<p className="font-medium mt-0.5">{proposal.leads.destination_address ?? "—"}</p>
							</div>
							{proposal.leads.destination_address_2 && (
								<div>
									<p className="text-ink-muted">{t("destination2")}</p>
									<p className="font-medium mt-0.5">{proposal.leads.destination_address_2}</p>
								</div>
							)}
							<div>
								<p className="text-ink-muted">{t("revenue")}</p>
								<p className="font-bold text-lg text-primary-text mt-0.5">
									{job.revenue ? formatRupiah(job.revenue) : "—"}
								</p>
							</div>
							<div>
								<p className="text-ink-muted">{t("expenses")}</p>
								<p className="font-bold text-lg mt-0.5">{formatRupiah(totalExpenses)}</p>
							</div>
						</Card>
					)}

					{/* Assignments */}
					<Card>
						<CardHeader
							title={
								<span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
									{t("assignments")}
								</span>
							}
							action={
								<Link
									href={`/jobs/${id}/assignments`}
									className="text-xs text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
								>
									{tAssign("manage")}
								</Link>
							}
						/>
						<div className="p-5">
							{(assignments ?? []).length === 0 ? (
								<p className="text-sm text-ink-faint">{t("noAssignments")}</p>
							) : (
								<ul className="space-y-2 text-sm">
									{(assignments ?? []).map((a) => {
										const name =
											a.assignment_type === "fleet"
												? (a.fleet as { name: string } | null)?.name
												: (a.crew as { name: string } | null)?.name;
										return (
											<li key={a.id} className="flex items-center justify-between">
												<span>
													{name ?? "—"}{" "}
													<span className="text-ink-faint text-xs">
														({a.role ?? a.assignment_type})
													</span>
												</span>
												{a.daily_rate && a.days && (
													<span className="tabular-nums text-xs text-ink-muted">
														{formatRupiah(a.daily_rate * a.days)}
													</span>
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
							title={
								<span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
									{t("expenses")}
								</span>
							}
							action={
								<Link
									href={`/jobs/${id}/expenses`}
									className="text-xs text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
								>
									{t("addOrViewAll")}
								</Link>
							}
						/>
						<div className="p-5">
							{(expenses ?? []).slice(0, 5).map((e) => (
								<div key={e.id} className="flex items-center justify-between py-1 text-sm">
									<span className="text-ink-muted">
										{tCategory(e.category.toLowerCase().replace(/\s+/g, "_"))}{" "}
										{e.description ? `— ${e.description}` : ""}
									</span>
									<span className="tabular-nums">{formatRupiah(e.amount)}</span>
								</div>
							))}
							{(expenses ?? []).length === 0 && (
								<p className="text-sm text-ink-faint">{t("noExpenses")}</p>
							)}
							{(expenses ?? []).length > 5 && (
								<Link
									href={`/jobs/${id}/expenses`}
									className="mt-1 block text-xs text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
								>
									{t("moreExpenses", { count: (expenses ?? []).length - 5 })}
								</Link>
							)}
						</div>
					</Card>

					{/* Timeline */}
					<Card>
						<CardHeader
							title={
								<span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
									{t("timeline")}
								</span>
							}
							action={
								<div className="flex items-center gap-2">
									<TimelineLogEventButton jobId={id} />
									<Link
										href={`/jobs/${id}/timeline`}
										className="text-xs text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
									>
										{tCommon("viewAll")} →
									</Link>
								</div>
							}
						/>
						<div className="p-5">
							{(timeline ?? []).length === 0 ? (
								<p className="text-sm text-ink-faint">{t("noTimelineEvents")}</p>
							) : (
								<ol className="space-y-3">
									{(timeline ?? []).map((t, idx) => (
										<li key={t.id} className="flex gap-3 text-sm">
											<div className="flex flex-col items-center">
												<div
													className={`w-2.5 h-2.5 rounded-full mt-0.5 ${idx === 0 ? "bg-primary" : "bg-line-strong"}`}
													aria-hidden="true"
												/>
												{idx < (timeline ?? []).length - 1 && (
													<div className="flex-1 w-px bg-line mt-1" aria-hidden="true" />
												)}
											</div>
											<div className="pb-3">
												<p className="font-medium capitalize">{t.event_type.replace(/_/g, " ")}</p>
												{t.notes && <p className="text-ink-muted text-xs mt-0.5">{t.notes}</p>}
												<p className="text-ink-faint text-xs">{formatDate(t.occurred_at)}</p>
											</div>
										</li>
									))}
								</ol>
							)}
						</div>
					</Card>

					{/* Documentation */}
					<JobMediaPanel
						jobId={id}
						initialMedia={
							(jobMedia ?? []) as {
								id: string;
								media_type: "photo" | "pdf";
								storage_path: string;
								file_name: string | null;
								caption: string | null;
								uploaded_at: string;
							}[]
						}
					/>
				</div>

				{/* Right: profit + invoice panel */}
				<div className="space-y-4">
					{/* Quick profit */}
					<Card className="p-5 space-y-3">
						<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
							{t("profit")}
						</h2>
						<div className="flex items-baseline gap-2">
							<span
								className={`text-2xl font-bold ${profit >= 0 ? "text-success" : "text-danger"}`}
							>
								{formatRupiah(profit)}
							</span>
							{job.revenue && job.revenue > 0 && (
								<span
									className={`text-sm font-medium tabular-nums ${profit >= 0 ? "text-success" : "text-danger"}`}
								>
									{Math.round((profit / job.revenue) * 100)}%
								</span>
							)}
						</div>
						<div className="text-xs text-ink-muted space-y-1">
							<div className="flex justify-between">
								<span>{t("revenue")}</span>
								<span className="tabular-nums">{formatRupiah(job.revenue ?? 0)}</span>
							</div>
							<div className="flex justify-between">
								<span>{t("expenses")}</span>
								<span className="tabular-nums text-danger">−{formatRupiah(totalExpenses)}</span>
							</div>
						</div>
						<Link
							href={`/jobs/${id}/expenses`}
							className={buttonStyles({ variant: "primary", size: "md", className: "w-full" })}
						>
							{t("logExpense")}
						</Link>
					</Card>

					{/* Estimation vs Actual */}
					<Card className="p-5 space-y-3">
						<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
							{t("estimationComparison")}
						</h2>
						{estimation && proposal ? (
							<>
								<div className="text-xs text-ink-muted space-y-1">
									<div className="flex justify-between">
										<span>{t("estimatedCost")}</span>
										<span className="tabular-nums">
											{formatRupiah(estimationOutputs.job_cost ?? 0)}
										</span>
									</div>
									<div className="flex justify-between">
										<span>{t("actualExpenses")}</span>
										<span className="tabular-nums">{formatRupiah(totalExpenses)}</span>
									</div>
									<div className="flex justify-between font-medium border-t border-line pt-1 mt-1">
										<span>{t("variance")}</span>
										{(() => {
											const variance = totalExpenses - (estimationOutputs.job_cost ?? 0);
											return (
												<span
													className={`tabular-nums ${variance > 0 ? "text-danger" : "text-success"}`}
												>
													{variance > 0 ? "+" : ""}
													{formatRupiah(variance)}
												</span>
											);
										})()}
									</div>
								</div>
								<Link
									href={`/estimations/new?proposal_id=${proposal.id}`}
									className={buttonStyles({
										variant: "secondary",
										size: "md",
										className: "w-full",
									})}
								>
									{t("viewEstimation")}
								</Link>
							</>
						) : proposal ? (
							<>
								<p className="text-sm text-ink-faint">{t("noEstimation")}</p>
								<Link
									href={`/estimations/new?proposal_id=${proposal.id}`}
									className={buttonStyles({
										variant: "secondary",
										size: "md",
										className: "w-full",
									})}
								>
									{t("createEstimation")}
								</Link>
							</>
						) : null}
					</Card>

					{/* Invoice */}
					<Card className="p-5 space-y-3">
						<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
							{t("invoice")}
						</h2>
						{invoice ? (
							<div className="space-y-2 text-sm">
								<p className="font-mono text-xs">{invoice.invoice_number}</p>
								<div className="flex justify-between">
									<span className="text-ink-muted">{tLabels("total")}</span>
									<span className="tabular-nums font-medium">
										{formatRupiah(invoice.total_amount)}
									</span>
								</div>
								<div className="flex justify-between">
									<span className="text-ink-muted">{tPay("paid")}</span>
									<span className="tabular-nums text-success">
										{formatRupiah(invoice.paid_amount ?? 0)}
									</span>
								</div>
								<Link
									href={`/invoices/${invoice.id}`}
									className={buttonStyles({
										variant: "secondary",
										size: "md",
										className: "w-full",
									})}
								>
									{t("manageInvoice")}
								</Link>
							</div>
						) : (
							<GenerateInvoiceButton jobId={id} jobRevenue={job.revenue ?? 0} />
						)}
					</Card>

					{/* Payments — recordable even before an invoice exists (e.g. DP) */}
					<Card className="p-5 space-y-3">
						<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
							{t("payments")}
						</h2>
						<PaymentsPanel
							jobId={id}
							totalAmount={invoice?.total_amount ?? job.revenue ?? 0}
							payments={payments ?? []}
							invoiceStatus={invoice?.status ?? null}
							jobNumber={job.job_number}
							customerName={customer?.name ?? ""}
							invoiceNumber={invoice?.invoice_number ?? null}
							company={pdfCompany}
							receiptTemplate={{
								signatureName: pdfTemplate.signatureName,
								signatureRole: pdfTemplate.signatureRole,
							}}
						/>
					</Card>
				</div>
			</div>
		</div>
	);
}

// Inline status actions — async so we can read translations
async function JobStatusActions({
	jobId,
	derivedStatus,
}: {
	jobId: string;
	derivedStatus: string;
}) {
	const t = await getTranslations("pages.jobDetail");
	return (
		<div className="flex gap-2 flex-wrap">
			{derivedStatus === "upcoming" && (
				<Link
					href={`/jobs/${jobId}/assignments`}
					className={buttonStyles({ variant: "secondary", size: "sm" })}
				>
					{t("assignResources")}
				</Link>
			)}
			{derivedStatus !== "cancelled" && (
				<Link
					href={`/jobs/${jobId}/expenses`}
					className={buttonStyles({ variant: "primary", size: "sm" })}
				>
					{t("expense")}
				</Link>
			)}
		</div>
	);
}
