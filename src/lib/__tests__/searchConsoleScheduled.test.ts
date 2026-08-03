import { describe, expect, it, vi } from "vitest";
import { SearchConsoleError } from "@/lib/search-console/client";
import { runScheduledSync, type ScheduledSyncDeps } from "@/lib/search-console/scheduled";
import { SeoSyncConflictError } from "@/lib/search-console/sync";

const TODAY = "2026-08-03"; // → window 2026-07-24 → 2026-07-31

function deps(over: Partial<ScheduledSyncDeps> = {}): ScheduledSyncDeps {
	return {
		today: () => TODAY,
		listActiveProperties: async () => [{ id: "p1", site_url: "sc-domain:indo-mover.com" }],
		syncProperty: vi.fn(async () => ({ queryRowsSynced: 12 })),
		...over,
	};
}

describe("runScheduledSync", () => {
	it("syncs each active property over the delayed window", async () => {
		const syncProperty = vi.fn(async () => ({ queryRowsSynced: 12 }));
		const summary = await runScheduledSync(deps({ syncProperty }));

		expect(summary.window).toEqual({ startDate: "2026-07-24", endDate: "2026-07-31" });
		expect(summary.ok).toBe(true);
		expect(summary.results).toEqual([{ propertyId: "p1", status: "success", queryRowsSynced: 12 }]);
		expect(syncProperty).toHaveBeenCalledWith({
			propertyId: "p1",
			startDate: "2026-07-24",
			endDate: "2026-07-31",
			syncType: "scheduled",
		});
	});

	it("marks a conflict as skipped (not a failure) and stays ok", async () => {
		const syncProperty = vi.fn(async () => Promise.reject(new SeoSyncConflictError("running")));
		const summary = await runScheduledSync(deps({ syncProperty }));

		expect(summary.ok).toBe(true);
		expect(summary.results[0]).toMatchObject({ status: "skipped", reason: "already_running" });
	});

	it("surfaces only a normalized error code on failure and reports not-ok", async () => {
		const syncProperty = vi.fn(async () =>
			Promise.reject(new SearchConsoleError("UNAUTHORIZED_PROPERTY", "403 secret-laden detail")),
		);
		const summary = await runScheduledSync(deps({ syncProperty }));

		expect(summary.ok).toBe(false);
		expect(summary.results[0]).toEqual({
			propertyId: "p1",
			status: "failed",
			errorCode: "UNAUTHORIZED_PROPERTY",
		});
		// No raw message leaked into the outcome.
		expect(JSON.stringify(summary.results[0])).not.toContain("secret-laden");
	});

	it("uses a generic code for non-Search-Console errors", async () => {
		const syncProperty = vi.fn(async () => Promise.reject(new Error("db blew up")));
		const summary = await runScheduledSync(deps({ syncProperty }));

		expect(summary.results[0]).toMatchObject({ status: "failed", errorCode: "SYNC_ERROR" });
		expect(JSON.stringify(summary.results[0])).not.toContain("db blew up");
	});

	it("isolates per-property failures across multiple properties", async () => {
		const syncProperty = vi
			.fn<(input: { propertyId: string }) => Promise<{ queryRowsSynced: number }>>()
			.mockResolvedValueOnce({ queryRowsSynced: 5 })
			.mockRejectedValueOnce(new Error("boom"));
		const summary = await runScheduledSync(
			deps({
				listActiveProperties: async () => [
					{ id: "p1", site_url: "a" },
					{ id: "p2", site_url: "b" },
				],
				syncProperty,
			}),
		);

		expect(summary.results.map((r) => r.status)).toEqual(["success", "failed"]);
		expect(summary.ok).toBe(false);
		expect(syncProperty).toHaveBeenCalledTimes(2);
	});

	it("returns ok with no results when there are no active properties", async () => {
		const summary = await runScheduledSync(deps({ listActiveProperties: async () => [] }));
		expect(summary.ok).toBe(true);
		expect(summary.results).toEqual([]);
	});
});
