/**
 * Pure date-range helpers for Search Console sync/backfill.
 *
 * All functions take and return plain "YYYY-MM-DD" strings and do calendar math
 * in UTC purely as string arithmetic — they NEVER derive "today" themselves.
 * Callers pass the current Jakarta date (from `todayInJakarta()`), keeping the
 * CLAUDE.md timezone rule intact: no UTC-based "now" on the server.
 */

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/**
 * Shift a "YYYY-MM-DD" date by a whole number of days. Uses UTC midnight
 * internally so there is no timezone drift; the input/output are date-only.
 */
export function shiftDate(date: string, days: number): string {
	const [y, m, d] = date.split("-").map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() + days);
	return dt.toISOString().slice(0, 10);
}

export type DateWindow = { startDate: string; endDate: string };

/**
 * The normal scheduled-sync window: re-sync a band of recent days, ending a few
 * days back because Search Console data lags and gets corrected. With the
 * defaults and today = 2026-08-03 this yields 2026-07-24 → 2026-07-31.
 */
export function delayedSyncWindow(
	today: string,
	{ lagDays = 3, spanDays = 7 }: { lagDays?: number; spanDays?: number } = {},
): DateWindow {
	return {
		endDate: shiftDate(today, -lagDays),
		startDate: shiftDate(today, -(lagDays + spanDays)),
	};
}

/**
 * Split an inclusive [start, end] range into per-calendar-month chunks. Each
 * chunk is clamped to the range, so the first chunk may start mid-month and the
 * last may end mid-month. Returns [] when start > end.
 */
export function monthChunks(start: string, end: string): DateWindow[] {
	if (start > end) return [];

	const chunks: DateWindow[] = [];
	let year = Number(start.slice(0, 4));
	let month = Number(start.slice(5, 7)); // 1-based
	let cursor = start;

	while (cursor <= end) {
		// Date.UTC(year, month, 0) → day 0 of the *next* month = last day of this one.
		const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
		const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`;
		chunks.push({ startDate: cursor, endDate: monthEnd <= end ? monthEnd : end });

		month += 1;
		if (month > 12) {
			month = 1;
			year += 1;
		}
		cursor = `${year}-${pad(month)}-01`;
	}
	return chunks;
}

// ---------------------------------------------------------------------------
// Dashboard display ranges
// ---------------------------------------------------------------------------

export type RangePreset = "28d" | "3m";

/** Length in days of each preset (3m ≈ 90 days for equal-length comparison). */
export const RANGE_DAYS: Record<RangePreset, number> = { "28d": 28, "3m": 90 };

export function isRangePreset(value: string | undefined): value is RangePreset {
	return value === "28d" || value === "3m";
}

export type DashboardRange = {
	preset: RangePreset;
	days: number;
	/** The most recent N complete days (ends yesterday; today is incomplete). */
	current: DateWindow;
	/** The N complete days immediately before `current`, for comparison. */
	previous: DateWindow;
};

/**
 * Resolve a preset into current + previous windows of equal length. Both are
 * derived from a caller-supplied Jakarta `today` ("YYYY-MM-DD"); today itself is
 * excluded because the day is not complete (and Search Console data lags).
 */
export function resolveDashboardRange(preset: RangePreset, today: string): DashboardRange {
	const days = RANGE_DAYS[preset];
	return {
		preset,
		days,
		current: { startDate: shiftDate(today, -days), endDate: shiftDate(today, -1) },
		previous: { startDate: shiftDate(today, -2 * days), endDate: shiftDate(today, -days - 1) },
	};
}
