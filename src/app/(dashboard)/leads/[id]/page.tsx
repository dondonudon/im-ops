import { MapPin, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DealTimeline } from "@/components/leads/DealTimeline";
import { LeadActionPanel } from "@/components/leads/LeadActionPanel";
import { LeadDuplicateButton } from "@/components/leads/LeadDuplicateButton";
import { LeadPhotoGallery } from "@/components/leads/LeadPhotoGallery";
import { BackLink } from "@/components/shared/BackLink";
import { Badge, buttonStyles, Card, PageHeader, toneFor } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatCustomerName, formatDate } from "@/lib/utils";

/**
 * Lead detail page — shows lead info, photo gallery, and status-driven action panel.
 */
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.leadDetail");
	const tStatus = await getTranslations("status.lead");
	const tCommon = await getTranslations("common.buttons");
	const tLabels = await getTranslations("common.labels");
	const tLeadType = await getTranslations("entity.leadType");
	const tChannel = await getTranslations("entity.originChannel");

	const [{ data: lead }, { data: photos }, { data: survey }, { data: proposals }, { data: job }] =
		await Promise.all([
			supabase
				.from("leads")
				.select(
					"*, destination_address_2, pickup_lat, pickup_lng, destination_lat, destination_lng, destination_2_lat, destination_2_lng, customers(id, prefix, name, phone)",
				)
				.eq("id", id)
				.single(),
			supabase
				.from("lead_photos")
				.select("id, storage_path, caption, uploaded_at")
				.eq("lead_id", id)
				.order("uploaded_at", { ascending: true }),
			supabase
				.from("surveys")
				.select("id, scheduled_at, conducted_at, gcal_event_id, notes")
				.eq("lead_id", id)
				.maybeSingle(),
			supabase
				.from("proposals")
				.select("id, proposal_number, status, final_price")
				.eq("lead_id", id)
				.order("created_at", { ascending: false }),
			supabase
				.from("jobs")
				.select("id, job_number, status, proposals!inner(lead_id)")
				.eq("proposals.lead_id", id)
				.order("created_at", { ascending: false })
				.limit(1)
				.maybeSingle(),
		]);

	if (!lead) notFound();

	const customer = lead.customers as {
		id: string;
		prefix: string | null;
		name: string;
		phone: string | null;
	} | null;

	return (
		<div className="space-y-6">
			<BackLink href="/leads" label={t("backToList")} />
			{/* Header */}
			<PageHeader
				title={
					<span className="flex items-center gap-3">
						{customer ? formatCustomerName(customer.prefix, customer.name) : "—"}
						<Badge tone={toneFor("lead", lead.status)} dot>
							{tStatus(lead.status as never)}
						</Badge>
					</span>
				}
				subtitle={
					<>
						{t("createdOn", { date: formatDate(lead.created_at) })}
						{lead.preferred_date &&
							` · ${t("preferredDate", { date: formatDate(lead.preferred_date) })}`}
					</>
				}
				actions={
					<>
						<LeadDuplicateButton leadId={id} />
						<Link
							href={`/leads/${id}/edit`}
							className={buttonStyles({ variant: "secondary", size: "md" })}
						>
							<Pencil size={14} aria-hidden="true" />
							{tCommon("edit")}
						</Link>
					</>
				}
			/>

			<div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
				{/* Left: deal lifecycle + details + photos */}
				<div className="xl:col-span-2 space-y-6">
					{/* Deal lifecycle — the unified deal hub view */}
					<DealTimeline
						status={lead.status}
						createdAt={lead.created_at}
						channel={lead.origin_channel}
						survey={survey}
						proposals={proposals ?? []}
						job={
							job
								? {
										id: job.id,
										job_number: job.job_number,
										status: job.status,
									}
								: null
						}
					/>

					{/* Move details */}
					<Card>
						<div className="px-5 pt-4 pb-2">
							<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">
								{t("moveDetails")}
							</h2>
							<div className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<p className="text-ink-muted">{t("pickup")}</p>
									<p className="font-medium mt-0.5 text-ink">{lead.pickup_address ?? "—"}</p>
									{lead.pickup_lat && lead.pickup_lng && (
										<a
											href={`https://www.google.com/maps/dir/?api=1&destination=${lead.pickup_lat},${lead.pickup_lng}`}
											target="_blank"
											rel="noopener noreferrer"
											className="text-xs text-primary-text hover:underline mt-0.5 inline-flex items-center gap-1"
										>
											<MapPin size={11} aria-hidden="true" />
											Open in Maps
										</a>
									)}
								</div>
								<div>
									<p className="text-ink-muted">{t("destination")}</p>
									<p className="font-medium mt-0.5 text-ink">{lead.destination_address ?? "—"}</p>
									{lead.destination_lat && lead.destination_lng && (
										<a
											href={`https://www.google.com/maps/dir/?api=1&destination=${lead.destination_lat},${lead.destination_lng}`}
											target="_blank"
											rel="noopener noreferrer"
											className="text-xs text-primary-text hover:underline mt-0.5 inline-flex items-center gap-1"
										>
											<MapPin size={11} aria-hidden="true" />
											Open in Maps
										</a>
									)}
								</div>
								{lead.destination_address_2 && (
									<div>
										<p className="text-ink-muted">{t("destination2")}</p>
										<p className="font-medium mt-0.5 text-ink">{lead.destination_address_2}</p>
										{lead.destination_2_lat && lead.destination_2_lng && (
											<a
												href={`https://www.google.com/maps/dir/?api=1&destination=${lead.destination_2_lat},${lead.destination_2_lng}`}
												target="_blank"
												rel="noopener noreferrer"
												className="text-xs text-primary-text hover:underline mt-0.5 inline-flex items-center gap-1"
											>
												<MapPin size={11} aria-hidden="true" />
												Open in Maps
											</a>
										)}
									</div>
								)}
								<div>
									<p className="text-ink-muted">{t("leadType")}</p>
									<p className="font-medium mt-0.5 text-ink">
										{lead.lead_type ? tLeadType(lead.lead_type as never) : "—"}
									</p>
								</div>
								<div>
									<p className="text-ink-muted">{t("channel")}</p>
									<p className="font-medium mt-0.5 text-ink">
										{lead.origin_channel ? tChannel(lead.origin_channel as never) : "—"}
									</p>
								</div>
							</div>
							{lead.notes && (
								<div className="text-sm mt-3 pb-2">
									<p className="text-ink-muted">{tLabels("notes")}</p>
									<p className="mt-0.5 whitespace-pre-wrap text-ink">{lead.notes}</p>
								</div>
							)}
						</div>
					</Card>

					{/* Photo gallery */}
					<LeadPhotoGallery leadId={id} photos={photos ?? []} />
				</div>

				{/* Right: action panel */}
				<div className="xl:col-span-1">
					<LeadActionPanel
						lead={{
							id: lead.id,
							status: lead.status,
							customer_id: lead.customer_id!,
							preferred_date: lead.preferred_date,
						}}
						survey={survey}
						proposals={proposals ?? []}
					/>
				</div>
			</div>
		</div>
	);
}
