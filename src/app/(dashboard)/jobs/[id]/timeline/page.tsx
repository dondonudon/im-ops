import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TimelineLogEventButton } from "@/components/jobs/TimelineLogEventButton";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function JobTimelinePage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.jobsTimeline");
	const tEvent = await getTranslations("entity.eventType");

	const [{ data: job }, { data: timeline }] = await Promise.all([
		supabase.from("jobs").select("id, job_number, status").eq("id", id).single(),
		supabase
			.from("job_timeline")
			.select("id, event_type, notes, occurred_at")
			.eq("job_id", id)
			.order("occurred_at", { ascending: false }),
	]);

	if (!job) notFound();

	return (
		<div className="space-y-6 max-w-3xl">
			<PageHeader
				title={t("title")}
				subtitle={
					<>
						<Link
							href={`/jobs/${id}`}
							className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink mb-1"
						>
							<ArrowLeft size={12} aria-hidden="true" />
							{t("backToJob")}
						</Link>
						<span className="block text-sm text-ink-faint font-mono">{job.job_number}</span>
					</>
				}
				actions={<TimelineLogEventButton jobId={id} />}
			/>

			<Card className="p-5">
				{(timeline ?? []).length === 0 ? (
					<EmptyState title={t("emptyWithHint")} />
				) : (
					<ol className="space-y-4">
						{(timeline ?? []).map((row, idx) => {
							let label: string;
							try {
								label = tEvent(row.event_type as never);
							} catch {
								label = row.event_type.replace(/_/g, " ");
							}
							return (
								<li key={row.id} className="flex gap-3 text-sm">
									<div className="flex flex-col items-center">
										<div
											className={`w-2.5 h-2.5 rounded-full mt-0.5 ${idx === 0 ? "bg-primary" : "bg-line-strong"}`}
											aria-hidden="true"
										/>
										{idx < (timeline ?? []).length - 1 && (
											<div className="flex-1 w-px bg-line mt-1" aria-hidden="true" />
										)}
									</div>
									<div className="pb-4 flex-1">
										<p className="font-medium text-ink">{label}</p>
										{row.notes && (
											<p className="text-ink-muted text-xs mt-0.5 whitespace-pre-wrap">
												{row.notes}
											</p>
										)}
										<p className="text-ink-faint text-xs mt-0.5">{formatDate(row.occurred_at)}</p>
									</div>
								</li>
							);
						})}
					</ol>
				)}
			</Card>
		</div>
	);
}
