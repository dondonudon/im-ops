import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StatusChip, leadStatusVariant } from "@/components/shared/StatusChip";
import { formatDate } from "@/lib/utils";
import { LeadActionPanel } from "@/components/leads/LeadActionPanel";
import { LeadDuplicateButton } from "@/components/leads/LeadDuplicateButton";
import { LeadPhotoGallery } from "@/components/leads/LeadPhotoGallery";
import { Pencil } from "lucide-react";

/**
 * Lead detail page — shows lead info, photo gallery, and status-driven action panel.
 */
export default async function LeadDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.leadDetail");
	const tStatus = await getTranslations("status.lead");
	const tCommon = await getTranslations("common.buttons");
	const tLabels = await getTranslations("common.labels");
	const tLeadType = await getTranslations("entity.leadType");
	const tChannel = await getTranslations("entity.originChannel");

	const [
		{ data: lead },
		{ data: photos },
		{ data: survey },
		{ data: proposals },
	] = await Promise.all([
		supabase
			.from("leads")
			.select("*, customers(id, name, phone)")
			.eq("id", id)
			.single(),
		supabase
			.from("lead_photos")
			.select("id, storage_path, caption, uploaded_at")
			.eq("lead_id", id)
			.order("uploaded_at", { ascending: true }),
		supabase
			.from("surveys")
			.select("id, scheduled_at, conducted_at, gcal_event_id")
			.eq("lead_id", id)
			.maybeSingle(),
		supabase
			.from("proposals")
			.select("id, proposal_number, status, final_price")
			.eq("lead_id", id)
			.order("created_at", { ascending: false }),
	]);

	if (!lead) notFound();

	const customer = lead.customers as {
		id: string;
		name: string;
		phone: string | null;
	} | null;

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div>
					<div className="flex items-center gap-3 mb-1">
						<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
							{customer?.name ?? "—"}
						</h1>
						<StatusChip
							label={tStatus(lead.status as never)}
							variant={leadStatusVariant(lead.status)}
						/>
					</div>
					<p className="text-sm text-gray-500 dark:text-gray-400">
						{t("createdOn", { date: formatDate(lead.created_at) })}
						{lead.preferred_date &&
							` · ${t("preferredDate", { date: formatDate(lead.preferred_date) })}`}
					</p>
				</div>
				<div className="flex items-center gap-2 flex-wrap">
					<LeadDuplicateButton leadId={id} />
					<Link
						href={`/leads/${id}/edit`}
						className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 shadow-sm"
					>
						<Pencil size={14} aria-hidden="true" />
						{tCommon("edit")}
					</Link>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Left: details + photos */}
				<div className="lg:col-span-2 space-y-6">
					{/* Move details */}
					<section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-3">
						<h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
							{t("moveDetails")}
						</h2>
						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p className="text-gray-500 dark:text-gray-400">{t("pickup")}</p>
								<p className="font-medium mt-0.5">{lead.pickup_address ?? "—"}</p>
							</div>
							<div>
								<p className="text-gray-500 dark:text-gray-400">{t("destination")}</p>
								<p className="font-medium mt-0.5">
									{lead.destination_address ?? "—"}
								</p>
							</div>
							<div>
								<p className="text-gray-500 dark:text-gray-400">{t("leadType")}</p>
								<p className="font-medium mt-0.5">
									{lead.lead_type ? tLeadType(lead.lead_type as never) : "—"}
								</p>
							</div>
							<div>
								<p className="text-gray-500 dark:text-gray-400">{t("channel")}</p>
								<p className="font-medium mt-0.5">
									{lead.origin_channel
										? tChannel(lead.origin_channel as never)
										: "—"}
								</p>
							</div>
						</div>
						{lead.notes && (
							<div className="text-sm">
								<p className="text-gray-500 dark:text-gray-400">
									{tLabels("notes")}
								</p>
								<p className="mt-0.5 whitespace-pre-wrap">{lead.notes}</p>
							</div>
						)}
					</section>

					{/* Photo gallery */}
					<LeadPhotoGallery leadId={id} photos={photos ?? []} />
				</div>

				{/* Right: action panel */}
				<div className="lg:col-span-1">
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
