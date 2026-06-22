import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AssignmentsPanel } from "@/components/jobs/AssignmentsPanel";
import { PageHeader } from "@/components/ui";
import { getActiveCrew, getActiveFleet } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";

export default async function AssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("panels.assignments");

	const [{ data: job }, { data: assignments }, fleetData, crew] = await Promise.all([
		supabase.from("jobs").select("id, job_number, move_date").eq("id", id).single(),
		supabase
			.from("job_assignments")
			.select("id, assignment_type, role, fleet_id, crew_id, fleet(name), crew(name)")
			.eq("job_id", id),
		getActiveFleet(),
		getActiveCrew(),
	]);

	if (!job) notFound();

	return (
		<div className="space-y-6 max-w-2xl">
			<PageHeader
				title={t("title")}
				subtitle={
					<Link
						href={`/jobs/${id}`}
						className="text-xs text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
					>
						← {job.job_number}
					</Link>
				}
			/>

			<AssignmentsPanel
				jobId={id}
				moveDate={job.move_date}
				assignments={assignments ?? []}
				fleetList={fleetData ?? []}
				crewList={crew ?? []}
			/>
		</div>
	);
}
