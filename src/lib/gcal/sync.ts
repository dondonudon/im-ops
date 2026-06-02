/**
 * Google Calendar integration helper.
 *
 * Uses a service-account-style refresh-token flow (3-legged OAuth).
 * Env vars required:
 *   GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, GCAL_REFRESH_TOKEN
 *
 * Never throws — all errors are returned as `{ ok: false, error }`.
 * Calendar sync is treated as best-effort; never block core operations on it.
 */

const GCAL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GCAL_EVENTS_BASE = "https://www.googleapis.com/calendar/v3/calendars";

export type GCalEventInput = {
	calendarId: string;
	summary: string;
	description?: string;
	// Either provide all-day dates …
	startDate?: string; // YYYY-MM-DD
	endDate?: string; // YYYY-MM-DD (defaults to startDate)
	// …or a precise timed window. dateTime takes precedence when both are set.
	startDateTime?: string; // RFC 3339 with offset
	endDateTime?: string; // RFC 3339 with offset
	timeZone?: string; // IANA, e.g. 'Asia/Jakarta'
	colorId?: string; // '1'–'11'
	/** Deep-link back to the originating record in IM Ops. */
	sourceUrl?: string;
	/** Label shown for the source link (e.g. "Open in IM Ops"). */
	sourceTitle?: string;
};

export type GCalResult =
	| { ok: true; eventId: string }
	| { ok: false; error: string; notFound?: boolean };

function isConfigured(): boolean {
	return Boolean(process.env.GCAL_CLIENT_ID && process.env.GCAL_REFRESH_TOKEN);
}

/** Obtain a short-lived access token using the stored refresh token. */
async function getAccessToken(): Promise<string> {
	const res = await fetch(GCAL_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: process.env.GCAL_CLIENT_ID ?? "",
			client_secret: process.env.GCAL_CLIENT_SECRET ?? "",
			refresh_token: process.env.GCAL_REFRESH_TOKEN ?? "",
			grant_type: "refresh_token",
		}),
	});
	if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
	const json = (await res.json()) as { access_token: string };
	return json.access_token;
}

function buildEventBody(input: GCalEventInput): Record<string, unknown> | string {
	const tz = input.timeZone ?? "Asia/Jakarta";
	const start = input.startDateTime
		? { dateTime: input.startDateTime, timeZone: tz }
		: { date: input.startDate };
	const end = input.endDateTime
		? { dateTime: input.endDateTime, timeZone: tz }
		: { date: input.endDate ?? input.startDate };

	if (!("dateTime" in start && start.dateTime) && !("date" in start && start.date)) {
		return "Event requires startDate or startDateTime.";
	}

	// Description gets the link appended so it's clickable in the mobile
	// Calendar app (which doesn't render the structured `source` field).
	const baseDescription = input.description ?? "";
	const description = input.sourceUrl
		? `${baseDescription}${baseDescription ? "\n\n" : ""}${input.sourceTitle ?? "Open in IM Ops"}: ${input.sourceUrl}`
		: baseDescription;

	const body: Record<string, unknown> = {
		summary: input.summary,
		description,
		start,
		end,
		colorId: input.colorId ?? "1",
	};

	if (input.sourceUrl) {
		body.source = {
			url: input.sourceUrl,
			title: input.sourceTitle ?? "Open in IM Ops",
		};
	}

	return body;
}

/**
 * Create a Google Calendar event for a job or survey.
 *
 * @security — tokens are exchanged server-side only; never exposed to the client.
 */
export async function pushCalendarEvent(input: GCalEventInput): Promise<GCalResult> {
	if (!isConfigured()) {
		return { ok: false, error: "Google Calendar not configured." };
	}

	const body = buildEventBody(input);
	if (typeof body === "string") return { ok: false, error: body };

	try {
		const accessToken = await getAccessToken();
		const res = await fetch(`${GCAL_EVENTS_BASE}/${encodeURIComponent(input.calendarId)}/events`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const text = await res.text();
			console.error(`[gcal] pushCalendarEvent error ${res.status}:`, text);
			return { ok: false, error: `GCal API error (${res.status})` };
		}

		const event = (await res.json()) as { id: string };
		return { ok: true, eventId: event.id };
	} catch (err: unknown) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Update an existing Google Calendar event in place.
 *
 * If the event has been manually deleted in Google Calendar this returns
 * `{ ok: false, notFound: true }` so the caller can clear the stale id and
 * fall back to creating a fresh event.
 */
export async function patchCalendarEvent(
	eventId: string,
	input: GCalEventInput,
): Promise<GCalResult> {
	if (!isConfigured()) {
		return { ok: false, error: "Google Calendar not configured." };
	}

	const body = buildEventBody(input);
	if (typeof body === "string") return { ok: false, error: body };

	try {
		const accessToken = await getAccessToken();
		const res = await fetch(
			`${GCAL_EVENTS_BASE}/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(eventId)}`,
			{
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			},
		);

		if (res.status === 404 || res.status === 410) {
			// Event was deleted (or never existed) in Google Calendar.
			return {
				ok: false,
				notFound: true,
				error: `GCal event ${eventId} not found (status ${res.status}).`,
			};
		}

		if (!res.ok) {
			const text = await res.text();
			console.error(`[gcal] patchCalendarEvent error ${res.status}:`, text);
			return { ok: false, error: `GCal API error (${res.status})` };
		}

		const event = (await res.json()) as { id: string };
		return { ok: true, eventId: event.id };
	} catch (err: unknown) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Delete a Google Calendar event.
 * Safe to call with a null/undefined eventId.
 */
export async function deleteCalendarEvent(
	calendarId: string,
	eventId: string | null | undefined,
): Promise<GCalResult> {
	if (!eventId) return { ok: false, error: "No event ID provided." };
	if (!isConfigured()) {
		return { ok: false, error: "Google Calendar not configured." };
	}

	try {
		const accessToken = await getAccessToken();
		const res = await fetch(
			`${GCAL_EVENTS_BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
			{
				method: "DELETE",
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);
		if (!res.ok && res.status !== 410 && res.status !== 404) {
			return { ok: false, error: `GCal delete error ${res.status}` };
		}
		return { ok: true, eventId };
	} catch (err: unknown) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
