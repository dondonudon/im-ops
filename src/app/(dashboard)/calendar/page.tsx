import { getTranslations } from "next-intl/server";
import { CalendarView } from "@/components/calendar/CalendarView";
import { SyncAllButton } from "@/components/calendar/SyncAllButton";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function CalendarPage() {
	const supabase = await createClient();
	const t = await getTranslations("pages.calendar");

	const now = new Date();
	const windowStart = new Date(now);
	windowStart.setFullYear(windowStart.getFullYear() - 1);
	const windowEnd = new Date(now);
	windowEnd.setMonth(windowEnd.getMonth() + 6);
	const startDate = windowStart.toISOString().slice(0, 10);
	const endDate = windowEnd.toISOString().slice(0, 10);

	const [{ data: jobs }, { data: surveys }] = await Promise.all([
		supabase
			.from("jobs")
			.select(`
				id, job_number, status, move_date, move_time, move_end_date, move_end_time, gcal_event_id,
				proposals(leads(customers(name), pickup_address, destination_address))
			`)
			.not("move_date", "is", null)
			.gte("move_date", startDate)
			.lte("move_date", endDate)
			.order("move_date"),
		supabase
			.from("surveys")
			.select(`
				id, scheduled_at, conducted_at, gcal_event_id,
				leads(id, customers(name))
			`)
			.not("scheduled_at", "is", null)
			.gte("scheduled_at", `${startDate}T00:00:00`)
			.lte("scheduled_at", `${endDate}T23:59:59`)
			.order("scheduled_at"),
	]);

	const events = [
		...(jobs ?? []).map((j) => {
			const proposal = j.proposals as {
				leads: {
					customers: { name: string } | null;
					pickup_address: string | null;
					destination_address: string | null;
				} | null;
			} | null;
			const customerName = proposal?.leads?.customers?.name ?? null;
			const pickup = proposal?.leads?.pickup_address ?? null;
			const destination = proposal?.leads?.destination_address ?? null;
			const detail =
				pickup && destination ? `${pickup} → ${destination}` : (pickup ?? destination ?? undefined);
			const moveTime = j.move_time as string | null;
			// "YYYY-MM-DDTHH:MM" so the agenda can extract the time; bare date for all-day.
			const start = moveTime ? `${j.move_date}T${moveTime.slice(0, 5)}` : j.move_date!;
			return {
				id: `job-${j.id}`,
				kind: "job" as const,
				title: customerName ?? j.job_number,
				subtitle: j.job_number,
				detail,
				start,
				endInclusive: (j.move_end_date as string | null) ?? j.move_date!,
				color: jobStatusColor(j.status),
				status: j.status,
				synced: Boolean(j.gcal_event_id),
				url: `/jobs/${j.id}`,
			};
		}),
		...(surveys ?? []).map((s) => {
			const lead = s.leads as {
				id: string;
				customers: { name: string } | null;
			} | null;
			const customerName = lead?.customers?.name ?? "Survey";
			return {
				id: `survey-${s.id}`,
				kind: "survey" as const,
				title: customerName,
				subtitle: "Survey",
				start: s.scheduled_at as string,
				endInclusive: (s.scheduled_at as string).slice(0, 10),
				color: s.conducted_at ? "#94a3b8" : "#3b82f6",
				status: s.conducted_at ? "done" : "scheduled",
				synced: Boolean(s.gcal_event_id),
				url: `/leads/${lead?.id ?? ""}`,
			};
		}),
	];

	return (
		<div className="space-y-6">
			<PageHeader
				title={t("title")}
				actions={
					<>
						<div className="flex items-center gap-3 text-xs text-ink-muted">
							<LegendDot color="#3b82f6" label={t("legend.survey")} />
							<LegendDot color="#22c55e" label={t("legend.scheduled")} />
							<LegendDot color="#0ea5e9" label={t("legend.inProgress")} />
							<LegendDot color="#64748b" label={t("legend.completed")} />
						</div>
						<SyncAllButton />
					</>
				}
			/>
			<CalendarView events={events} />
		</div>
	);
}

function LegendDot({ color, label }: { color: string; label: string }) {
	return (
		<span className="flex items-center gap-1.5">
			<span
				className="inline-block w-3 h-3 rounded-sm"
				style={{ backgroundColor: color }}
				aria-hidden="true"
			/>
			{label}
		</span>
	);
}

function jobStatusColor(status: string): string {
	switch (status) {
		case "in_progress":
			return "#0ea5e9";
		case "completed":
			return "#64748b";
		case "closed":
			return "#94a3b8";
		case "cancelled":
			return "#ef4444";
		default: // scheduled
			return "#22c55e";
	}
}
