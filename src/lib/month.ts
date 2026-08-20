/**
 * Month-scoped page helpers. `/money`, `/expenses` and `/reports` all take a
 * `?month=YYYY-MM` param and query a half-open [start, end) date window.
 */

/** Falls back to the current Jakarta month when the param is missing or malformed. */
export function parseMonth(raw?: string): string {
	if (raw && /^\d{4}-\d{2}$/.test(raw)) return raw;
	return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).slice(0, 7);
}

/** Half-open window: `start` inclusive, `end` exclusive (the 1st of the next month). */
export function monthRange(ym: string): { start: string; end: string } {
	const [year, month] = ym.split("-").map(Number);
	const start = `${year}-${String(month).padStart(2, "0")}-01`;
	const next = new Date(year, month, 1);
	const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
	return { start, end };
}

/**
 * "August 2026" / "Agustus 2026". A plain calendar label, so no timezone
 * conversion applies — the date is constructed at local midnight on purpose.
 */
export function formatMonthLabel(ym: string, locale: string): string {
	return new Date(`${ym}-01T00:00:00`).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
		month: "long",
		year: "numeric",
	});
}
