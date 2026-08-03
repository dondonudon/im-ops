/**
 * Pure normalization of raw Search Console rows into storable shapes.
 * No I/O — unit-tested directly.
 */

import type { SearchConsoleRow } from "./types";

/** A normalized daily-query metric, minus property_id / synced_at. */
export type NormalizedQueryDaily = {
	metric_date: string;
	query: string;
	clicks: number;
	impressions: number;
	position: number;
};

export type NormalizeResult<T> = {
	rows: T[];
	/** Rows dropped because expected dimension keys were missing. */
	skipped: number;
};

/**
 * Normalize rows from a `["date", "query"]` query. Rows missing either key are
 * skipped and counted (never inserted with nulls). `ctr` is intentionally
 * dropped — it is derivable from clicks/impressions.
 */
export function normalizeQueryRows(
	rows: SearchConsoleRow[],
): NormalizeResult<NormalizedQueryDaily> {
	const out: NormalizedQueryDaily[] = [];
	let skipped = 0;

	for (const row of rows) {
		const [metricDate, query] = row.keys ?? [];
		if (!metricDate || !query) {
			skipped += 1;
			continue;
		}
		out.push({
			metric_date: metricDate,
			query,
			clicks: row.clicks ?? 0,
			impressions: row.impressions ?? 0,
			position: row.position ?? 0,
		});
	}

	return { rows: out, skipped };
}

/** A normalized daily page↔query metric, minus property_id / synced_at. */
export type NormalizedPageQueryDaily = {
	metric_date: string;
	page: string;
	query: string;
	clicks: number;
	impressions: number;
	position: number;
};

/**
 * Normalize rows from a `["date", "page", "query"]` query. Rows missing any of
 * the three keys are skipped and counted.
 */
export function normalizePageQueryRows(
	rows: SearchConsoleRow[],
): NormalizeResult<NormalizedPageQueryDaily> {
	const out: NormalizedPageQueryDaily[] = [];
	let skipped = 0;

	for (const row of rows) {
		const [metricDate, page, query] = row.keys ?? [];
		if (!metricDate || !page || !query) {
			skipped += 1;
			continue;
		}
		out.push({
			metric_date: metricDate,
			page,
			query,
			clicks: row.clicks ?? 0,
			impressions: row.impressions ?? 0,
			position: row.position ?? 0,
		});
	}

	return { rows: out, skipped };
}

/** Split an array into fixed-size chunks (last chunk may be smaller). */
export function chunk<T>(items: T[], size: number): T[][] {
	if (size <= 0) throw new Error("chunk size must be > 0");
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}
