import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";
import { TimelineLogEventButton } from "@/components/jobs/TimelineLogEventButton";

export default async function JobTimelinePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.jobsTimeline");
	const tEvent = await getTranslations("entity.eventType");

	const [{ data: job }, { data: timeline }] = await Promise.all([
		supabase
			.from("jobs")
			.select("id, job_number, status")
			.eq("id", id)
			.single(),
		supabase
			.from("job_timeline")
			.select("id, event_type, notes, occurred_at")
			.eq("job_id", id)
			.order("occurred_at", { ascending: false }),
	]);

	if (!job) notFound();

	return (
		<div className="space-y-6 max-w-3xl">
			<div className="flex items-center justify-between flex-wrap gap-3">
				<div>
					<Link
						href={`/jobs/${id}`}
						className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-1"
					>
						<ArrowLeft size={12} aria-hidden="true" />
						{t("backToJob")}
					</Link>
					<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
						{t("title")}
					</h1>
					<p className="text-sm text-gray-500 font-mono mt-0.5">
						{job.job_number}
					</p>
				</div>
				<TimelineLogEventButton jobId={id} />
			</div>

			<section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
				{(timeline ?? []).length === 0 ? (
					<p className="text-sm text-gray-400">{t("emptyWithHint")}</p>
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
											className={`w-2.5 h-2.5 rounded-full mt-0.5 ${idx === 0 ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"}`}
											aria-hidden="true"
										/>
										{idx < (timeline ?? []).length - 1 && (
											<div
												className="flex-1 w-px bg-gray-200 dark:bg-gray-700 mt-1"
												aria-hidden="true"
											/>
										)}
									</div>
									<div className="pb-4 flex-1">
										<p className="font-medium">{label}</p>
										{row.notes && (
											<p className="text-gray-500 text-xs mt-0.5 whitespace-pre-wrap">
												{row.notes}
											</p>
										)}
										<p className="text-gray-400 text-xs mt-0.5">
											{formatDate(row.occurred_at)}
										</p>
									</div>
								</li>
							);
						})}
					</ol>
				)}
			</section>
		</div>
	);
}
