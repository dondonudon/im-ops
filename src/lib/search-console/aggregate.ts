/**
 * Pure grouping/aggregation of daily rows into per-query and per-page rollups.
 * No I/O — unit-tested. Uses the impression-weighted `summarize` from metrics.
 */

import { type MetricRow, type SeoSummary, summarize } from "./metrics";

export type QueryAggregate = SeoSummary & { query: string };
export type PageAggregate = SeoSummary & {
	page: string;
	/** Number of distinct queries the page ranks for in the window. */
	queryCount: number;
	/** Query contributing the most impressions to the page, or null. */
	topQuery: string | null;
};

type QueryRow = { query: string } & MetricRow;
type PageQueryRow = { page: string; query: string } & MetricRow;

const metric = (r: MetricRow): MetricRow => ({
	clicks: r.clicks,
	impressions: r.impressions,
	position: r.position,
});

/** Roll daily query rows up to one row per query. */
export function aggregateByQuery(rows: QueryRow[]): QueryAggregate[] {
	const groups = new Map<string, MetricRow[]>();
	for (const r of rows) {
		const arr = groups.get(r.query);
		if (arr) arr.push(metric(r));
		else groups.set(r.query, [metric(r)]);
	}
	return Array.from(groups, ([query, rs]) => ({ query, ...summarize(rs) }));
}

/** Roll daily page↔query rows up to one row per page. */
export function aggregateByPage(rows: PageQueryRow[]): PageAggregate[] {
	const groups = new Map<string, { metrics: MetricRow[]; queries: Map<string, number> }>();
	for (const r of rows) {
		let g = groups.get(r.page);
		if (!g) {
			g = { metrics: [], queries: new Map() };
			groups.set(r.page, g);
		}
		g.metrics.push(metric(r));
		g.queries.set(r.query, (g.queries.get(r.query) ?? 0) + r.impressions);
	}
	return Array.from(groups, ([page, g]) => {
		const topQuery = Array.from(g.queries).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
		return { page, ...summarize(g.metrics), queryCount: g.queries.size, topQuery };
	});
}

export type QueryPageShare = {
	query: string;
	totalImpressions: number;
	/** Pages ranking for the query, by impression share (desc). */
	pages: Array<{ page: string; impressions: number; share: number }>;
};

/** For each query, how its impressions are split across pages (cannibalization). */
export function queryPageDistribution(rows: PageQueryRow[]): QueryPageShare[] {
	const byQuery = new Map<string, Map<string, number>>();
	for (const r of rows) {
		let pages = byQuery.get(r.query);
		if (!pages) {
			pages = new Map();
			byQuery.set(r.query, pages);
		}
		pages.set(r.page, (pages.get(r.page) ?? 0) + r.impressions);
	}
	return Array.from(byQuery, ([query, pages]) => {
		const total = Array.from(pages.values()).reduce((a, b) => a + b, 0);
		const pageList = Array.from(pages, ([page, impressions]) => ({
			page,
			impressions,
			share: total > 0 ? impressions / total : 0,
		})).sort((a, b) => b.impressions - a.impressions);
		return { query, totalImpressions: total, pages: pageList };
	});
}
