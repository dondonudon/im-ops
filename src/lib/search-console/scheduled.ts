import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { todayInJakarta } from "@/lib/utils";
import { SearchConsoleError } from "./client";
import { delayedSyncWindow } from "./dates";
import { SeoSyncConflictError, syncSearchConsoleProperty } from "./sync";

/**
 * Scheduled (cron) sync orchestration, separated from the HTTP route so it can
 * be unit-tested with injected deps. Syncs every active property over the
 * delayed window (re-syncing recent days that Search Console may still correct).
 *
 * Per-property failures are isolated: one property failing does not abort the
 * others, and only a normalized error code is surfaced (never a raw message /
 * credential material).
 */

export type ScheduledPropertyOutcome = {
	propertyId: string;
	status: "success" | "skipped" | "failed";
	queryRowsSynced?: number;
	reason?: string;
	errorCode?: string;
};

export type ScheduledSyncSummary = {
	window: { startDate: string; endDate: string };
	results: ScheduledPropertyOutcome[];
	/** false when any property hard-failed (conflicts/skips do not count). */
	ok: boolean;
};

export type ScheduledSyncDeps = {
	listActiveProperties: () => Promise<Array<{ id: string; site_url: string }>>;
	syncProperty: (input: {
		propertyId: string;
		startDate: string;
		endDate: string;
		syncType: "scheduled";
	}) => Promise<{ queryRowsSynced: number }>;
	/** Injectable for tests; defaults to the Jakarta calendar date. */
	today?: () => string;
};

function defaultDeps(): ScheduledSyncDeps {
	return {
		listActiveProperties: async () => {
			const db = createAdminClient();
			const { data, error } = await db
				.from("seo_properties")
				.select("id, site_url")
				.eq("is_active", true);
			if (error) throw error;
			return data ?? [];
		},
		syncProperty: (input) => syncSearchConsoleProperty(input),
	};
}

export async function runScheduledSync(
	deps: ScheduledSyncDeps = defaultDeps(),
): Promise<ScheduledSyncSummary> {
	const today = (deps.today ?? todayInJakarta)();
	const window = delayedSyncWindow(today);

	console.log(`[seo-cron] starting scheduled sync, window ${window.startDate} → ${window.endDate}`);

	const properties = await deps.listActiveProperties();
	const results: ScheduledPropertyOutcome[] = [];

	for (const property of properties) {
		try {
			const res = await deps.syncProperty({
				propertyId: property.id,
				startDate: window.startDate,
				endDate: window.endDate,
				syncType: "scheduled",
			});
			console.log(`[seo-cron] ${property.site_url}: ${res.queryRowsSynced} rows synced`);
			results.push({
				propertyId: property.id,
				status: "success",
				queryRowsSynced: res.queryRowsSynced,
			});
		} catch (err) {
			if (err instanceof SeoSyncConflictError) {
				results.push({ propertyId: property.id, status: "skipped", reason: "already_running" });
				continue;
			}
			// Surface only a normalized code; log the detail server-side.
			const errorCode = err instanceof SearchConsoleError ? err.code : "SYNC_ERROR";
			console.error(
				`[seo-cron] ${property.site_url} failed (${errorCode}):`,
				err instanceof Error ? err.message : err,
			);
			results.push({ propertyId: property.id, status: "failed", errorCode });
		}
	}

	const ok = !results.some((r) => r.status === "failed");
	const count = (s: ScheduledPropertyOutcome["status"]) =>
		results.filter((r) => r.status === s).length;
	console.log(
		`[seo-cron] done: ${count("success")} ok, ${count("skipped")} skipped, ${count("failed")} failed`,
	);

	return { window, results, ok };
}
