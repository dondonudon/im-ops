import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NegotiationHistory } from "@/components/proposals/NegotiationHistory";
import { ProposalActionPanel } from "@/components/proposals/ProposalActionPanel";
import { ProposalCustomFieldsEditor } from "@/components/proposals/ProposalCustomFieldsEditor";
import { ProposalDuplicateButton } from "@/components/proposals/ProposalDuplicateButton";
import { ProposalPDFDownloadButton } from "@/components/proposals/ProposalPDFDownloadButton";
import { BackLink } from "@/components/shared/BackLink";
import { Badge, buttonStyles, Card, CardHeader, PageHeader, toneFor } from "@/components/ui";
import { buildCompanySettings, buildProposalTemplateSettings } from "@/lib/pdfSettings";
import { parseCustomFields } from "@/lib/proposalCustomFields";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRupiah } from "@/lib/utils";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.proposalDetail");
	const tStatus = await getTranslations("status.proposal");
	const tJob = await getTranslations("pages.jobDetail");

	const [
		{ data: proposal },
		{ data: revisions },
		{ data: estimation },
		{ data: job },
		{ data: settingsRows },
	] = await Promise.all([
		supabase
			.from("proposals")
			.select(`
        *,
        leads(
          id, pickup_address, destination_address, preferred_date,
          customers(id, name, phone, email, type, company_name, address)
        )
      `)
			.eq("id", id)
			.single(),
		supabase.from("proposal_revisions").select("*").eq("proposal_id", id).order("version_number"),
		supabase
			.from("estimations")
			.select("id, outputs, inputs, settings_snapshot")
			.eq("proposal_id", id)
			.maybeSingle(),
		supabase.from("jobs").select("id, job_number, status").eq("proposal_id", id).maybeSingle(),
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
				"proposal_included_services",
				"proposal_signature_name",
				"proposal_signature_role",
			]),
	]);

	if (!proposal) notFound();

	const settingsMap = Object.fromEntries((settingsRows ?? []).map((s) => [s.key, s.value]));
	const pdfCompany = buildCompanySettings(settingsMap);
	const pdfTemplate = buildProposalTemplateSettings(settingsMap);
	const customFields = parseCustomFields(proposal.custom_fields);

	const lead = proposal.leads as {
		id: string;
		pickup_address: string | null;
		destination_address: string | null;
		preferred_date: string | null;
		customers: {
			id: string;
			name: string;
			phone: string | null;
			email: string | null;
			type: "individual" | "corporate";
			company_name: string | null;
			address: string | null;
		} | null;
	} | null;

	const customer =
		(lead?.customers as {
			id: string;
			name: string;
			phone: string | null;
			email: string | null;
			type: "individual" | "corporate";
			company_name: string | null;
			address: string | null;
		} | null) ?? null;
	const estimationOutputs = (estimation?.outputs ?? {}) as Record<string, number>;

	return (
		<div className="space-y-6">
			<BackLink href="/proposals" label={t("backToList")} />
			{/* Header */}
			<PageHeader
				title={
					<span className="flex items-center gap-3">
						<span className="font-mono">{proposal.proposal_number}</span>
						<Badge tone={toneFor("proposal", proposal.status)} dot>
							{tStatus(proposal.status as never)}
						</Badge>
					</span>
				}
				subtitle={
					<>
						{customer?.name ?? "—"} · {t("created", { date: formatDate(proposal.created_at) })}
						{proposal.approved_at &&
							` · ${t("approved", { date: formatDate(proposal.approved_at) })}`}
					</>
				}
				actions={
					<>
						{lead && (
							<Link
								href={`/leads/${lead.id}`}
								className="text-sm text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
							>
								{t("viewLead")}
							</Link>
						)}
						{lead && (proposal.status === "lost" || proposal.status === "expired") && (
							<ProposalDuplicateButton
								proposalId={proposal.id}
								leadId={lead.id}
								serviceType={proposal.service_type ?? "DOM"}
							/>
						)}
						{customer && lead && (
							<ProposalPDFDownloadButton
								pdfProps={{
									proposal: {
										proposal_number: proposal.proposal_number,
										final_price: proposal.final_price,
										created_at: proposal.created_at,
										approved_at: proposal.approved_at,
									},
									customer: {
										name: customer.name,
										phone: customer.phone,
										email: customer.email,
										type: customer.type,
										company_name: customer.company_name,
										address: customer.address,
									},
									lead: {
										pickup_address: lead.pickup_address,
										destination_address: lead.destination_address,
										preferred_date: lead.preferred_date,
									},
									outputs: estimationOutputs,
									company: pdfCompany,
									template: pdfTemplate,
									customFields,
								}}
							/>
						)}
					</>
				}
			/>

			<div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
				{/* Left: estimation + negotiation */}
				<div className="xl:col-span-2 space-y-6">
					{/* Move summary */}
					{lead && (
						<Card className="p-5 grid grid-cols-2 gap-4 text-sm">
							<div>
								<p className="text-ink-muted">{tJob("pickup")}</p>
								<p className="font-medium mt-0.5 text-ink">{lead.pickup_address ?? "—"}</p>
							</div>
							<div>
								<p className="text-ink-muted">{tJob("destination")}</p>
								<p className="font-medium mt-0.5 text-ink">{lead.destination_address ?? "—"}</p>
							</div>
							{lead.preferred_date && (
								<div>
									<p className="text-ink-muted">{t("preferredDate")}</p>
									<p className="font-medium mt-0.5 text-ink">{formatDate(lead.preferred_date)}</p>
								</div>
							)}
							{proposal.final_price && (
								<div>
									<p className="text-ink-muted">{t("finalPrice")}</p>
									<p className="text-lg font-bold mt-0.5 text-primary-text">
										{formatRupiah(proposal.final_price)}
									</p>
								</div>
							)}
						</Card>
					)}

					{/* Estimation snapshot */}
					{estimation && (
						<Card>
							<CardHeader
								title={
									<span className="uppercase tracking-wide text-xs">
										{t("estimationBreakdown")}
									</span>
								}
								action={
									proposal.status === "draft" ? (
										<Link
											href={`/estimations/new?proposal_id=${id}`}
											className={buttonStyles({ variant: "ghost", size: "sm" })}
										>
											{t("editEstimation")}
										</Link>
									) : undefined
								}
							/>
							<div className="p-5">
								<EstimationSnapshot outputs={estimation.outputs as Record<string, number>} />
							</div>
						</Card>
					)}

					{/* Negotiation history */}
					<NegotiationHistory
						proposalId={id}
						revisions={revisions ?? []}
						status={proposal.status}
					/>

					{/* Per-proposal PDF customization */}
					<ProposalCustomFieldsEditor proposalId={id} initial={customFields} />
				</div>

				{/* Right: action panel */}
				<div className="xl:col-span-1">
					<ProposalActionPanel
						proposal={{
							id: proposal.id,
							status: proposal.status,
							final_price: proposal.final_price,
							pdf_url: proposal.pdf_url,
							lead_id: (lead as { id: string } | null)?.id ?? "",
						}}
						lead={lead}
						customer={customer}
						hasEstimation={Boolean(estimation)}
						job={job}
					/>
				</div>
			</div>
		</div>
	);
}

async function EstimationSnapshot({ outputs }: { outputs: Record<string, number> }) {
	const t = await getTranslations("pages.proposalDetail.breakdown");
	const rows: Array<[string, string]> = [
		["vehicle", "vehicle_cost"],
		["manpower", "manpower_cost"],
		["food", "food_cost"],
		["packing", "packing_cost"],
		["toll", "toll_cost"],
		["operationalBuffer", "operational_buffer"],
		["adjustedCost", "adjusted_cost"],
		["finalProfit", "final_profit"],
		["internalTarget", "internal_target_price"],
		["offerPrice", "initial_offer_price"],
	];

	return (
		<table className="w-full text-sm">
			<tbody className="divide-y divide-line">
				{rows
					.filter(([, key]) => outputs[key] > 0)
					.map(([labelKey, key]) => (
						<tr key={key}>
							<td className="py-1.5 text-ink-muted">{t(labelKey as never)}</td>
							<td className="py-1.5 text-right tabular-nums font-medium text-ink">
								{formatRupiah(outputs[key])}
							</td>
						</tr>
					))}
			</tbody>
		</table>
	);
}
