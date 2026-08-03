/**
 * Pure metric aggregation for the SEO dashboard. No I/O — unit-tested directly.
 *
 * Key correctness rules:
 *  - CTR is clicks/impressions in aggregate — never an average of per-row CTRs.
 *  - Average position is impression-WEIGHTED, never an unweighted mean.
 *  - Percentage change is `null` (render "New") when the previous value was 0.
 *  - Position change is a point delta where positive = improved (rank got lower).
 */

export type MetricRow = {
	clicks: number;
	impressions: number;
	position: number;
};

export type SeoSummary = {
	clicks: number;
	impressions: number;
	/** Aggregate CTR as a fraction (0–1). */
	ctr: number;
	/** Impression-weighted average position, or null when no impressions. */
	position: number | null;
};

export function totalClicks(rows: MetricRow[]): number {
	return rows.reduce((sum, r) => sum + r.clicks, 0);
}

export function totalImpressions(rows: MetricRow[]): number {
	return rows.reduce((sum, r) => sum + r.impressions, 0);
}

export function aggregateCtr(clicks: number, impressions: number): number {
	return impressions > 0 ? clicks / impressions : 0;
}

/** Impression-weighted average position. Returns null when total impressions = 0. */
export function weightedPosition(rows: MetricRow[]): number | null {
	const impressions = totalImpressions(rows);
	if (impressions === 0) return null;
	const weighted = rows.reduce((sum, r) => sum + r.position * r.impressions, 0);
	return weighted / impressions;
}

export function summarize(rows: MetricRow[]): SeoSummary {
	const clicks = totalClicks(rows);
	const impressions = totalImpressions(rows);
	return {
		clicks,
		impressions,
		ctr: aggregateCtr(clicks, impressions),
		position: weightedPosition(rows),
	};
}

/**
 * Fractional change between two values (e.g. 0.18 = +18%). Returns null when the
 * previous value was 0 and the current is non-zero (an infinite change — the UI
 * shows "New" instead), and 0 when both are 0.
 */
export function percentChange(current: number, previous: number): number | null {
	if (previous === 0) return current === 0 ? 0 : null;
	return (current - previous) / previous;
}

/**
 * Position point-change. Lower position is better, so improvement =
 * previous - current (positive = improved). Null when either side has no data.
 */
export function positionDelta(previous: number | null, current: number | null): number | null {
	if (previous === null || current === null) return null;
	return previous - current;
}

export type KeywordStatusBand = "top3" | "page1" | "nearPage1" | "needsWork" | "noData";

/**
 * Bucket a weighted position into a coarse status band (plan §18). `null`
 * position (no impressions in the window) → "noData".
 */
export function keywordStatusBand(position: number | null): KeywordStatusBand {
	if (position === null) return "noData";
	if (position <= 3) return "top3";
	if (position <= 10) return "page1";
	if (position <= 20) return "nearPage1";
	return "needsWork";
}
