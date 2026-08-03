import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DateWindow } from "./dates";
import { type MetricRow, positionDelta, type SeoSummary, summarize } from "./metrics";

/**
 * Server-side read helpers for the SEO dashboard. These use the RLS-enforced
 * server client (never the service-role admin client) — authenticated users have
 * read access to the seo_* tables.
 *
 * KPI totals are aggregated in the app layer via pagination so they are correct
 * even when a window spans more than PostgREST's 1000-row page cap. If volume
 * grows enough that this is slow, replace the pagination with a SQL aggregate
 * function (see docs/seo-dashboard-plan.md §28).
 */

type Db = SupabaseClient<Database>;
type TargetKeywordRow = Database["public"]["Tables"]["seo_target_keywords"]["Row"];

const PAGE_SIZE = 1000;

export type SeoProperty = { id: string; site_url: string; display_name: string };

/** The single active property (schema supports many; today there is one). */
export async function getActiveProperty(db: Db): Promise<SeoProperty | null> {
	const { data, error } = await db
		.from("seo_properties")
		.select("id, site_url, display_name")
		.eq("is_active", true)
		.order("created_at", { ascending: true })
		.limit(1)
		.maybeSingle();
	if (error) throw error;
	return data;
}

/** Fetch all metric rows in a window, paging past the 1000-row cap. */
async function fetchQueryRows(
	db: Db,
	propertyId: string,
	window: DateWindow,
): Promise<MetricRow[]> {
	const rows: MetricRow[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await db
			.from("seo_query_daily")
			.select("clicks, impressions, position")
			.eq("property_id", propertyId)
			.gte("metric_date", window.startDate)
			.lte("metric_date", window.endDate)
			.range(from, from + PAGE_SIZE - 1);
		if (error) throw error;
		if (data) rows.push(...data);
		if (!data || data.length < PAGE_SIZE) break;
	}
	return rows;
}

/** Property-wide KPI summary for a window. */
export async function getSeoSummary(
	db: Db,
	propertyId: string,
	window: DateWindow,
): Promise<SeoSummary> {
	return summarize(await fetchQueryRows(db, propertyId, window));
}

export type TargetKeywordMetric = {
	keyword: string;
	targetPage: string | null;
	priority: number;
	current: SeoSummary;
	previous: SeoSummary;
	/** previous.position - current.position (positive = improved), or null. */
	positionDelta: number | null;
};

export async function getTargetKeywords(db: Db, propertyId: string): Promise<TargetKeywordRow[]> {
	const { data, error } = await db
		.from("seo_target_keywords")
		.select("*")
		.eq("property_id", propertyId)
		.eq("is_active", true)
		.order("priority", { ascending: true })
		.order("keyword", { ascending: true });
	if (error) throw error;
	return data ?? [];
}

/**
 * Per-target-keyword metrics for the current and previous windows. Fetches only
 * the rows whose `query` exactly matches a target keyword (≤ keywords × days
 * rows, well under the page cap), then aggregates each window in-app.
 */
export async function getTargetKeywordMetrics(
	db: Db,
	propertyId: string,
	keywords: TargetKeywordRow[],
	current: DateWindow,
	previous: DateWindow,
): Promise<TargetKeywordMetric[]> {
	if (keywords.length === 0) return [];

	const keywordStrings = keywords.map((k) => k.keyword);
	const { data, error } = await db
		.from("seo_query_daily")
		.select("query, metric_date, clicks, impressions, position")
		.eq("property_id", propertyId)
		.in("query", keywordStrings)
		.gte("metric_date", previous.startDate)
		.lte("metric_date", current.endDate);
	if (error) throw error;

	const rows = data ?? [];
	const inWindow = (date: string, w: DateWindow) => date >= w.startDate && date <= w.endDate;

	return keywords.map((k) => {
		const forKeyword = rows.filter((r) => r.query === k.keyword);
		const currentRows = forKeyword.filter((r) => inWindow(r.metric_date, current));
		const previousRows = forKeyword.filter((r) => inWindow(r.metric_date, previous));
		const currentSummary = summarize(currentRows);
		const previousSummary = summarize(previousRows);
		return {
			keyword: k.keyword,
			targetPage: k.target_page,
			priority: k.priority,
			current: currentSummary,
			previous: previousSummary,
			positionDelta: positionDelta(previousSummary.position, currentSummary.position),
		};
	});
}

export type LatestSeoSync = {
	status: Database["public"]["Tables"]["seo_sync_runs"]["Row"]["status"];
	syncType: Database["public"]["Tables"]["seo_sync_runs"]["Row"]["sync_type"];
	endDate: string;
	completedAt: string | null;
	startedAt: string;
	errorMessage: string | null;
};

/** Most recent sync run (any status) for the sync-status card. */
export async function getLatestSeoSync(db: Db, propertyId: string): Promise<LatestSeoSync | null> {
	const { data, error } = await db
		.from("seo_sync_runs")
		.select("status, sync_type, end_date, completed_at, started_at, error_message")
		.eq("property_id", propertyId)
		.order("started_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) throw error;
	if (!data) return null;
	return {
		status: data.status,
		syncType: data.sync_type,
		endDate: data.end_date,
		completedAt: data.completed_at,
		startedAt: data.started_at,
		errorMessage: data.error_message,
	};
}

// ---------------------------------------------------------------------------
// Second-slice reads: query/page rollups + keyword trend
// ---------------------------------------------------------------------------

export type QueryMetricRow = {
	query: string;
	clicks: number;
	impressions: number;
	position: number;
};

/** All query-level rows in a window (query + metrics), paged past the cap. */
export async function getQueryRows(
	db: Db,
	propertyId: string,
	window: DateWindow,
): Promise<QueryMetricRow[]> {
	const rows: QueryMetricRow[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await db
			.from("seo_query_daily")
			.select("query, clicks, impressions, position")
			.eq("property_id", propertyId)
			.gte("metric_date", window.startDate)
			.lte("metric_date", window.endDate)
			.range(from, from + PAGE_SIZE - 1);
		if (error) throw error;
		if (data) rows.push(...data);
		if (!data || data.length < PAGE_SIZE) break;
	}
	return rows;
}

export type PageQueryMetricRow = {
	page: string;
	query: string;
	clicks: number;
	impressions: number;
	position: number;
};

/** All page↔query rows in a window, paged past the cap. */
export async function getPageQueryRows(
	db: Db,
	propertyId: string,
	window: DateWindow,
): Promise<PageQueryMetricRow[]> {
	const rows: PageQueryMetricRow[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await db
			.from("seo_page_query_daily")
			.select("page, query, clicks, impressions, position")
			.eq("property_id", propertyId)
			.gte("metric_date", window.startDate)
			.lte("metric_date", window.endDate)
			.range(from, from + PAGE_SIZE - 1);
		if (error) throw error;
		if (data) rows.push(...data);
		if (!data || data.length < PAGE_SIZE) break;
	}
	return rows;
}

export type TrendPoint = {
	date: string;
	position: number;
	clicks: number;
	impressions: number;
};

/**
 * Daily position/clicks/impressions for one keyword. One row per day exists
 * (PK is property+date+query), so no aggregation is needed. Only days with a
 * measured row are returned — gaps mean "no data", never position 0.
 */
export async function getKeywordTrend(
	db: Db,
	propertyId: string,
	keyword: string,
	window: DateWindow,
): Promise<TrendPoint[]> {
	const { data, error } = await db
		.from("seo_query_daily")
		.select("metric_date, clicks, impressions, position")
		.eq("property_id", propertyId)
		.eq("query", keyword)
		.gte("metric_date", window.startDate)
		.lte("metric_date", window.endDate)
		.order("metric_date", { ascending: true });
	if (error) throw error;
	return (data ?? []).map((r) => ({
		date: r.metric_date,
		position: r.position,
		clicks: r.clicks,
		impressions: r.impressions,
	}));
}
