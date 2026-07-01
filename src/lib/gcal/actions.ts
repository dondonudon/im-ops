"use server";

import {
	deleteCalendarEvent,
	type GCalEventInput,
	type GCalResult,
	patchCalendarEvent,
	pushCalendarEvent,
} from "@/lib/gcal/sync";
import { createClient } from "@/lib/supabase/server";

type ActionResult =
	| { ok: true; eventId: string; created?: boolean; updated?: boolean }
	| { ok: false; error: string };

async function getCalendarId(): Promise<string | null> {
	const supabase = await createClient();
	const { data } = await supabase
		.from("system_settings")
		.select("value")
		.eq("key", "gcal_calendar_id")
		.maybeSingle();
	const id = data?.value?.trim();
	return id ? id : null;
}

/**
 * Public base URL for IM Ops, used to build deep links in GCal events.
 * Priority: NEXT_PUBLIC_APP_URL → Vercel-provided URL → localhost dev fallback.
 * Returned without a trailing slash.
 */
function getAppBaseUrl(): string {
	const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
	if (explicit) return explicit.replace(/\/+$/, "");
	const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
	if (vercel) return `https://${vercel}`;
	return "http://localhost:3000";
}

function isoPlusHours(iso: string, hours: number): string {
	const d = new Date(iso);
	d.setHours(d.getHours() + hours);
	return d.toISOString();
}

// Asia/Jakarta is UTC+7 year-round (no DST). The whole app is Indonesia-only
// per spec, so this offset is safe to hardcode.
const JAKARTA_OFFSET = "+07:00";

/**
 * Build an RFC 3339 datetime from a Postgres DATE (`YYYY-MM-DD`) and a
 * Postgres TIME (`HH:MM:SS`, optionally `.fff`) or a bare `HH:MM`.
 * Google Calendar v3 rejects naive datetimes; the offset is required.
 */
function buildJakartaDateTime(date: string, time: string): string {
	// Normalize to HH:MM — drop seconds + fractional seconds + handle HH:MM input.
	const hhmm = time.slice(0, 5);
	return `${date}T${hhmm}:00${JAKARTA_OFFSET}`;
}

/**
 * Add `hours` to a normalized HH:MM time string. Wraps past 24h to "23:59"
 * (we don't try to span past midnight — that's an edge case the user should
 * model with an explicit end date + end time instead).
 */
function addHoursToHHMM(time: string, hours: number): string {
	const hhmm = time.slice(0, 5);
	const [h, m] = hhmm.split(":").map((s) => Number(s));
	const total = h * 60 + m + hours * 60;
	if (total >= 24 * 60) return "23:59";
	const nh = Math.floor(total / 60);
	const nm = total % 60;
	return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

/**
 * Push (or update) a survey event in Google Calendar.
 *
 * If `surveys.gcal_event_id` is already set we PATCH the existing event so we
 * don't create duplicates on edit. If the PATCH 404s — meaning the event was
 * deleted manually in Google Calendar — we clear the stale id and POST a new one.
 */
export async function syncSurveyToCalendar(surveyId: string): Promise<ActionResult> {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return { ok: false, error: "Unauthorized" };

	const { data: survey } = await supabase
		.from("surveys")
		.select(
			"id, lead_id, scheduled_at, notes, gcal_event_id, leads(pickup_address, destination_address, customers(name))",
		)
		.eq("id", surveyId)
		.single();

	if (!survey) return { ok: false, error: "Survey not found." };

	const calendarId = await getCalendarId();
	if (!calendarId) return { ok: false, error: "Google Calendar not configured." };

	const lead = survey.leads as {
		pickup_address: string | null;
		destination_address: string | null;
		customers: { name: string } | null;
	} | null;
	const customerName = lead?.customers?.name ?? "Customer";

	const eventInput: GCalEventInput = {
		calendarId,
		summary: `[SURVEY] ${customerName} — ${lead?.pickup_address ?? ""}`,
		description: survey.notes ?? "",
		startDateTime: survey.scheduled_at,
		endDateTime: isoPlusHours(survey.scheduled_at, 1),
		colorId: "1",
		sourceUrl: `${getAppBaseUrl()}/leads/${survey.lead_id}`,
		sourceTitle: "Open lead in IM Ops",
	};

	return upsertEvent("surveys", surveyId, survey.gcal_event_id ?? null, eventInput);
}

/**
 * Push (or update) a job event in Google Calendar.
 *
 * End time defaults:
 *   1. job.move_end_time if set
 *   2. job.move_time + 8h
 *   3. 18:00 if no start time was given
 */
export async function syncJobToCalendar(jobId: string): Promise<ActionResult> {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return { ok: false, error: "Unauthorized" };

	const { data: job } = await supabase
		.from("jobs")
		.select(
			"id, job_number, move_date, move_time, move_end_date, move_end_time, revenue, gcal_event_id, proposals(proposal_number, leads(pickup_address, destination_address, destination_address_2, customers(name)))",
		)
		.eq("id", jobId)
		.single();

	if (!job) return { ok: false, error: "Job not found." };

	const calendarId = await getCalendarId();
	if (!calendarId) return { ok: false, error: "Google Calendar not configured." };

	const proposal = job.proposals as {
		proposal_number: string;
		leads: {
			pickup_address: string | null;
			destination_address: string | null;
			destination_address_2: string | null;
			customers: { name: string } | null;
		} | null;
	} | null;
	const lead = proposal?.leads;
	const customerName = lead?.customers?.name ?? "Customer";

	const startTime = job.move_time ?? "08:00";
	const endDate = job.move_end_date ?? job.move_date;
	const endTime = job.move_end_time ?? (job.move_time ? addHoursToHHMM(job.move_time, 8) : "18:00");

	const dest2 = lead?.destination_address_2;
	const eventInput: GCalEventInput = {
		calendarId,
		summary: `[JOB] ${customerName} — ${lead?.pickup_address ?? ""} → ${lead?.destination_address ?? ""}${dest2 ? ` → ${dest2}` : ""}`,
		description: `Job: ${job.job_number}\nProposal: ${proposal?.proposal_number ?? ""}\nRevenue: ${job.revenue != null ? Number(job.revenue).toLocaleString("id-ID") : ""}`,
		startDateTime: buildJakartaDateTime(job.move_date, startTime),
		endDateTime: buildJakartaDateTime(endDate, endTime),
		colorId: "2",
		sourceUrl: `${getAppBaseUrl()}/jobs/${jobId}`,
		sourceTitle: "Open job in IM Ops",
	};

	return upsertEvent("jobs", jobId, job.gcal_event_id ?? null, eventInput);
}

/**
 * PATCH if we have an event id, POST otherwise. On 404/410 (event manually
 * deleted from Google Calendar), clear the stale id and create fresh.
 */
async function upsertEvent(
	table: "surveys" | "jobs",
	rowId: string,
	currentEventId: string | null,
	eventInput: GCalEventInput,
): Promise<ActionResult> {
	const supabase = await createClient();

	if (currentEventId) {
		const patched = await patchCalendarEvent(currentEventId, eventInput);
		if (patched.ok) {
			return { ok: true, eventId: patched.eventId, updated: true };
		}
		if (!patched.notFound) {
			return patched;
		}
		// Stale id — wipe it so the retry below isn't ambiguous, then fall through.
		await supabase.from(table).update({ gcal_event_id: null }).eq("id", rowId);
	}

	const created = await pushCalendarEvent(eventInput);
	if (!created.ok) return created;

	await supabase.from(table).update({ gcal_event_id: created.eventId }).eq("id", rowId);

	return { ok: true, eventId: created.eventId, created: true };
}

/**
 * Removes a calendar event (used on cancellation) and clears the stored id.
 */
export async function removeJobCalendarEvent(jobId: string): Promise<GCalResult> {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return { ok: false, error: "Unauthorized" };
	const calendarId = await getCalendarId();
	if (!calendarId) return { ok: false, error: "Google Calendar not configured." };

	const { data: job } = await supabase
		.from("jobs")
		.select("gcal_event_id")
		.eq("id", jobId)
		.single();

	if (!job?.gcal_event_id) return { ok: false, error: "No calendar event linked." };

	const result = await deleteCalendarEvent(calendarId, job.gcal_event_id);
	if (result.ok) {
		await supabase.from("jobs").update({ gcal_event_id: null }).eq("id", jobId);
	}
	return result;
}

async function syncChunked<T>(
	items: T[],
	fn: (item: T) => Promise<{ ok: boolean }>,
	concurrency = 20,
): Promise<{ ok: number; failed: number }> {
	const results = { ok: 0, failed: 0 };
	// Concurrency-limited pool — all items run in parallel up to `concurrency`
	// simultaneous calls. Avoids the O(items/5) sequential rounds of the old
	// chunk-then-await approach.
	let index = 0;
	async function worker() {
		while (index < items.length) {
			const item = items[index++];
			const r = await fn(item);
			if (r.ok) results.ok += 1;
			else results.failed += 1;
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
	return results;
}

/**
 * Re-sync recent + future jobs and surveys to Google Calendar.
 *
 * Window: from 30 days ago through everything future. We deliberately include
 * past-but-recent records (operators sometimes want to see the trail in GCal)
 * and *don't* exclude completed surveys — completion just means they happened,
 * not that the calendar entry should disappear. Cancelled jobs are excluded.
 *
 * Returns per-bucket counts plus the cutoff so the UI can explain what got
 * skipped.
 */
export async function syncAllToCalendar(): Promise<{
	jobs: { ok: number; failed: number };
	surveys: { ok: number; failed: number };
	cutoffISO: string;
}> {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) throw new Error("Unauthorized");
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 30);
	const cutoffISO = cutoff.toISOString().slice(0, 10);

	const [{ data: jobs }, { data: surveys }] = await Promise.all([
		supabase.from("jobs").select("id").gte("move_date", cutoffISO).neq("status", "cancelled"),
		// Surveys: no completion filter — and use a date-only comparison against
		// scheduled_at so timezone-edge surveys at the boundary aren't dropped.
		supabase.from("surveys").select("id").gte("scheduled_at", `${cutoffISO}T00:00:00+00:00`),
	]);

	const jobResults = await syncChunked(jobs ?? [], (j) => syncJobToCalendar(j.id));
	const surveyResults = await syncChunked(surveys ?? [], (s) => syncSurveyToCalendar(s.id));

	return { jobs: jobResults, surveys: surveyResults, cutoffISO };
}
