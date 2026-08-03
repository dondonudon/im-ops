import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { queryAllSearchConsoleRows } from "./client";
import { chunk, normalizePageQueryRows, normalizeQueryRows } from "./normalize";
import type { SearchConsoleRow } from "./types";

/**
 * SEO synchronization service.
 *
 * Orchestration is separated from I/O: the lifecycle (overlap guard, run
 * logging, batched upserts, partial-failure handling) runs against an
 * injectable `SeoSyncStore`, so it is unit-tested with a fake store — no DB or
 * Google access. The real store (`createSupabaseSeoStore`) is a thin adapter
 * over the service-role admin client.
 *
 * Each run syncs two datasets: query-level (date+query → seo_query_daily) and
 * page↔query (date+page+query → seo_page_query_daily). They fail independently —
 * one failing leaves the other's data intact and marks the run `partial`.
 */

type Db = ReturnType<typeof createAdminClient>;
type QueryDailyInsert = Database["public"]["Tables"]["seo_query_daily"]["Insert"];
type PageQueryDailyInsert = Database["public"]["Tables"]["seo_page_query_daily"]["Insert"];

/** Reject a new sync while another has been running for less than this long. */
export const STALE_RUN_MS = 30 * 60 * 1000;
/** Upsert rows to Supabase in batches of this size. */
export const UPSERT_BATCH_SIZE = 500;

export type SeoSyncType = "scheduled" | "manual" | "backfill";

export type SyncSearchConsoleInput = {
	propertyId: string;
	startDate: string;
	endDate: string;
	syncType: SeoSyncType;
};

export type SeoSyncResult = {
	syncRunId: string;
	propertyId: string;
	startDate: string;
	endDate: string;
	queryRowsSynced: number;
	pageQueryRowsSynced: number;
	skippedRows: number;
	status: "success" | "partial";
};

/** Thrown when another sync for the property is already running (not stale). */
export class SeoSyncConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SeoSyncConflictError";
	}
}

// ---------------------------------------------------------------------------
// Store abstraction
// ---------------------------------------------------------------------------

export interface SeoSyncStore {
	getProperty(propertyId: string): Promise<{ id: string; site_url: string } | null>;
	getActiveRun(propertyId: string): Promise<{ id: string; started_at: string } | null>;
	failRun(runId: string, message: string): Promise<void>;
	startRun(input: {
		propertyId: string;
		syncType: SeoSyncType;
		startDate: string;
		endDate: string;
	}): Promise<string>;
	upsertQueryDaily(rows: QueryDailyInsert[]): Promise<void>;
	upsertPageQueryDaily(rows: PageQueryDailyInsert[]): Promise<void>;
	finishRun(
		runId: string,
		patch: {
			status: "success" | "partial";
			queryRowsSynced: number;
			pageQueryRowsSynced: number;
			metadata: Record<string, unknown>;
		},
	): Promise<void>;
}

/** Real store backed by the service-role admin client (bypasses RLS). */
export function createSupabaseSeoStore(db: Db = createAdminClient()): SeoSyncStore {
	return {
		async getProperty(propertyId) {
			const { data, error } = await db
				.from("seo_properties")
				.select("id, site_url")
				.eq("id", propertyId)
				.maybeSingle();
			if (error) throw error;
			return data;
		},
		async getActiveRun(propertyId) {
			const { data, error } = await db
				.from("seo_sync_runs")
				.select("id, started_at")
				.eq("property_id", propertyId)
				.eq("status", "running")
				.order("started_at", { ascending: false })
				.limit(1)
				.maybeSingle();
			if (error) throw error;
			return data;
		},
		async failRun(runId, message) {
			const { error } = await db
				.from("seo_sync_runs")
				.update({
					status: "failed",
					error_message: message.slice(0, 500),
					completed_at: new Date().toISOString(),
				})
				.eq("id", runId);
			if (error) throw error;
		},
		async startRun(input) {
			const { data, error } = await db
				.from("seo_sync_runs")
				.insert({
					property_id: input.propertyId,
					sync_type: input.syncType,
					status: "running",
					start_date: input.startDate,
					end_date: input.endDate,
				})
				.select("id")
				.single();
			if (error) throw error;
			return data.id;
		},
		async upsertQueryDaily(rows) {
			const { error } = await db
				.from("seo_query_daily")
				.upsert(rows, { onConflict: "property_id,metric_date,query" });
			if (error) throw error;
		},
		async upsertPageQueryDaily(rows) {
			const { error } = await db
				.from("seo_page_query_daily")
				.upsert(rows, { onConflict: "property_id,metric_date,page,query" });
			if (error) throw error;
		},
		async finishRun(runId, patch) {
			const { error } = await db
				.from("seo_sync_runs")
				.update({
					status: patch.status,
					query_rows_synced: patch.queryRowsSynced,
					page_query_rows_synced: patch.pageQueryRowsSynced,
					completed_at: new Date().toISOString(),
					metadata:
						patch.metadata as Database["public"]["Tables"]["seo_sync_runs"]["Update"]["metadata"],
				})
				.eq("id", runId);
			if (error) throw error;
		},
	};
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

type FetchRows = (input: {
	siteUrl: string;
	startDate: string;
	endDate: string;
}) => Promise<SearchConsoleRow[]>;

export type SyncSearchConsoleDeps = {
	store: SeoSyncStore;
	/** Fetch date+query rows. */
	fetchRows: FetchRows;
	/** Fetch date+page+query rows. */
	fetchPageRows: FetchRows;
	now?: () => Date;
	batchSize?: number;
};

function defaultSyncDeps(): SyncSearchConsoleDeps {
	return {
		store: createSupabaseSeoStore(),
		fetchRows: ({ siteUrl, startDate, endDate }) =>
			queryAllSearchConsoleRows({ siteUrl, startDate, endDate, dimensions: ["date", "query"] }),
		fetchPageRows: ({ siteUrl, startDate, endDate }) =>
			queryAllSearchConsoleRows({
				siteUrl,
				startDate,
				endDate,
				dimensions: ["date", "page", "query"],
			}),
	};
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Sync one property for a date range. Idempotent: rows upsert on their primary
 * keys, so re-running the same window is safe.
 *
 * Datasets fail independently: if both fail the run is marked `failed` and the
 * error rethrown; if exactly one fails the run is `partial` and the successful
 * dataset is preserved.
 */
export async function syncSearchConsoleProperty(
	input: SyncSearchConsoleInput,
	deps: SyncSearchConsoleDeps = defaultSyncDeps(),
): Promise<SeoSyncResult> {
	const { store, fetchRows, fetchPageRows } = deps;
	const now = deps.now ?? (() => new Date());
	const batchSize = deps.batchSize ?? UPSERT_BATCH_SIZE;

	const property = await store.getProperty(input.propertyId);
	if (!property) {
		throw new Error(`SEO property not found: ${input.propertyId}`);
	}

	// Overlap guard: a recent running run blocks; a stale one is recovered.
	const active = await store.getActiveRun(input.propertyId);
	if (active) {
		const ageMs = now().getTime() - new Date(active.started_at).getTime();
		if (ageMs < STALE_RUN_MS) {
			throw new SeoSyncConflictError(
				`A sync for property ${input.propertyId} is already running (started ${active.started_at}).`,
			);
		}
		await store.failRun(active.id, "Superseded: run exceeded the stale threshold.");
	}

	const runId = await store.startRun({
		propertyId: input.propertyId,
		syncType: input.syncType,
		startDate: input.startDate,
		endDate: input.endDate,
	});

	const window = {
		siteUrl: property.site_url,
		startDate: input.startDate,
		endDate: input.endDate,
	};
	const syncedAt = now().toISOString();
	const metadata: Record<string, unknown> = {};
	const errors: string[] = [];

	// Dataset A — date + query
	let queryRowsSynced = 0;
	try {
		const raw = await fetchRows(window);
		const { rows, skipped } = normalizeQueryRows(raw);
		const inserts: QueryDailyInsert[] = rows.map((r) => ({
			property_id: input.propertyId,
			metric_date: r.metric_date,
			query: r.query,
			clicks: r.clicks,
			impressions: r.impressions,
			position: r.position,
			synced_at: syncedAt,
		}));
		for (const batch of chunk(inserts, batchSize)) await store.upsertQueryDaily(batch);
		queryRowsSynced = rows.length;
		metadata.querySkipped = skipped;
		metadata.queryFetched = raw.length;
	} catch (err) {
		errors.push(`query: ${errorMessage(err)}`);
	}

	// Dataset B — date + page + query
	let pageQueryRowsSynced = 0;
	try {
		const raw = await fetchPageRows(window);
		const { rows, skipped } = normalizePageQueryRows(raw);
		const inserts: PageQueryDailyInsert[] = rows.map((r) => ({
			property_id: input.propertyId,
			metric_date: r.metric_date,
			page: r.page,
			query: r.query,
			clicks: r.clicks,
			impressions: r.impressions,
			position: r.position,
			synced_at: syncedAt,
		}));
		for (const batch of chunk(inserts, batchSize)) await store.upsertPageQueryDaily(batch);
		pageQueryRowsSynced = rows.length;
		metadata.pageSkipped = skipped;
		metadata.pageFetched = raw.length;
	} catch (err) {
		errors.push(`page_query: ${errorMessage(err)}`);
	}

	if (errors.length === 2) {
		const message = errors.join(" | ");
		await store.failRun(runId, message);
		throw new Error(message);
	}

	const status = errors.length === 1 ? "partial" : "success";
	if (errors.length === 1) metadata.error = errors[0];

	await store.finishRun(runId, { status, queryRowsSynced, pageQueryRowsSynced, metadata });

	return {
		syncRunId: runId,
		propertyId: input.propertyId,
		startDate: input.startDate,
		endDate: input.endDate,
		queryRowsSynced,
		pageQueryRowsSynced,
		skippedRows:
			((metadata.querySkipped as number | undefined) ?? 0) +
			((metadata.pageSkipped as number | undefined) ?? 0),
		status,
	};
}
