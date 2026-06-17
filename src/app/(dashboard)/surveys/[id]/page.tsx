import { ArrowLeft, CalendarDays, ClipboardList, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GCalRetryButton } from "@/components/shared/GCalRetryButton";
import { SurveyDetailClient } from "@/components/surveys/SurveyDetailClient";
import { Badge, buttonStyles, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

/**
 * Survey detail page — shows survey info, special items, media gallery,
 * access notes and general notes. Allows marking the survey as done.
 */
export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();

	const [{ data: survey }, { data: media }] = await Promise.all([
		supabase
			.from("surveys")
			.select(
				"id, lead_id, scheduled_at, conducted_at, access_notes, special_items, notes, surveyor_id, gcal_event_id, leads(id, pickup_address, destination_address, destination_address_2, customers(name))",
			)
			.eq("id", id)
			.single(),
		supabase
			.from("survey_media")
			.select("id, media_type, storage_path, caption, uploaded_at")
			.eq("survey_id", id)
			.order("uploaded_at"),
	]);

	if (!survey) notFound();

	const lead = survey.leads as {
		id: string;
		pickup_address: string | null;
		destination_address: string | null;
		destination_address_2: string | null;
		customers: { name: string } | null;
	} | null;

	const customerName = lead?.customers?.name ?? "Unknown Customer";
	const isDone = !!survey.conducted_at;

	return (
		<div className="max-w-3xl mx-auto space-y-5">
			{/* Back link */}
			<Link
				href={`/leads/${survey.lead_id}`}
				className={buttonStyles({ variant: "ghost", size: "sm" })}
			>
				<ArrowLeft size={15} aria-hidden="true" />
				Back to Lead
			</Link>

			{/* Header */}
			<Card className="p-6">
				<div className="flex items-start justify-between flex-wrap gap-4">
					<div>
						<h1 className="text-xl font-bold text-ink">{customerName}</h1>
						<p className="text-sm text-ink-muted mt-0.5">In-Home Survey</p>
					</div>
					<div className="flex items-center gap-2 flex-wrap">
						<GCalRetryButton
							kind="survey"
							id={survey.id}
							hasEvent={Boolean(survey.gcal_event_id)}
						/>
						<Badge tone={isDone ? "positive" : "pending"} dot>
							{isDone ? "Completed" : "Scheduled"}
						</Badge>
					</div>
				</div>

				<dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
					<div className="flex items-center gap-2 text-ink-muted">
						<CalendarDays size={15} className="text-ink-faint shrink-0" aria-hidden="true" />
						<div>
							<dt className="text-xs text-ink-faint leading-none mb-0.5">Scheduled</dt>
							<dd className="font-medium">{formatDate(survey.scheduled_at)}</dd>
						</div>
					</div>
					{survey.conducted_at && (
						<div className="flex items-center gap-2 text-ink-muted">
							<CalendarDays size={15} className="text-success shrink-0" aria-hidden="true" />
							<div>
								<dt className="text-xs text-ink-faint leading-none mb-0.5">Completed</dt>
								<dd className="font-medium">{formatDate(survey.conducted_at)}</dd>
							</div>
						</div>
					)}
					{lead?.pickup_address && (
						<div className="flex items-start gap-2 text-ink-muted">
							<User size={15} className="text-ink-faint shrink-0 mt-0.5" aria-hidden="true" />
							<div>
								<dt className="text-xs text-ink-faint leading-none mb-0.5">Pickup</dt>
								<dd className="font-medium">{lead.pickup_address}</dd>
							</div>
						</div>
					)}
					{lead?.destination_address && (
						<div className="flex items-start gap-2 text-ink-muted">
							<ClipboardList
								size={15}
								className="text-ink-faint shrink-0 mt-0.5"
								aria-hidden="true"
							/>
							<div>
								<dt className="text-xs text-ink-faint leading-none mb-0.5">Destination</dt>
								<dd className="font-medium">{lead.destination_address}</dd>
							</div>
						</div>
					)}
					{lead?.destination_address_2 && (
						<div className="flex items-start gap-2 text-ink-muted">
							<ClipboardList
								size={15}
								className="text-ink-faint shrink-0 mt-0.5"
								aria-hidden="true"
							/>
							<div>
								<dt className="text-xs text-ink-faint leading-none mb-0.5">Second destination</dt>
								<dd className="font-medium">{lead.destination_address_2}</dd>
							</div>
						</div>
					)}
				</dl>
			</Card>

			{/* Interactive client section: notes, items, media, actions */}
			<SurveyDetailClient
				survey={{
					id: survey.id,
					lead_id: survey.lead_id,
					access_notes: survey.access_notes,
					special_items: survey.special_items as {
						type: string;
						qty: number;
						note: string;
					}[],
					notes: survey.notes,
					conducted_at: survey.conducted_at,
				}}
				initialMedia={media ?? []}
			/>
		</div>
	);
}
