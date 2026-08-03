import { describe, expect, it, vi } from "vitest";
import {
	SeoSyncConflictError,
	type SeoSyncStore,
	type SyncSearchConsoleDeps,
	syncSearchConsoleProperty,
} from "@/lib/search-console/sync";
import type { SearchConsoleRow } from "@/lib/search-console/types";

const PROPERTY_ID = "11111111-1111-1111-1111-111111111111";

type RunRecord = {
	id: string;
	status: "running" | "success" | "partial" | "failed";
	started_at: string;
	error_message?: string;
	query_rows_synced?: number;
	page_query_rows_synced?: number;
	metadata?: Record<string, unknown>;
};

/**
 * In-memory fake store. Upserts key rows by their PK so tests can assert
 * idempotency and per-dataset counts.
 */
function makeStore(
	options: {
		property?: { id: string; site_url: string } | null;
		activeRun?: { id: string; started_at: string } | null;
	} = {},
) {
	const property =
		options.property === undefined
			? { id: PROPERTY_ID, site_url: "sc-domain:indo-mover.com" }
			: options.property;

	const runs = new Map<string, RunRecord>();
	const queryRows = new Map<string, unknown>();
	const pageRows = new Map<string, unknown>();
	let seq = 0;

	const store: SeoSyncStore = {
		getProperty: vi.fn(async () => property),
		getActiveRun: vi.fn(async () => options.activeRun ?? null),
		failRun: vi.fn(async (runId: string, message: string) => {
			const run = runs.get(runId);
			if (run) {
				run.status = "failed";
				run.error_message = message;
			}
		}),
		startRun: vi.fn(async () => {
			seq += 1;
			const id = `run-${seq}`;
			runs.set(id, { id, status: "running", started_at: new Date().toISOString() });
			return id;
		}),
		upsertQueryDaily: vi.fn(async (rows: Array<Record<string, unknown>>) => {
			for (const r of rows) queryRows.set(`${r.property_id}|${r.metric_date}|${r.query}`, r);
		}),
		upsertPageQueryDaily: vi.fn(async (rows: Array<Record<string, unknown>>) => {
			for (const r of rows)
				pageRows.set(`${r.property_id}|${r.metric_date}|${r.page}|${r.query}`, r);
		}),
		finishRun: vi.fn(async (runId: string, patch) => {
			const run = runs.get(runId);
			if (run) {
				run.status = patch.status;
				run.query_rows_synced = patch.queryRowsSynced;
				run.page_query_rows_synced = patch.pageQueryRowsSynced;
				run.metadata = patch.metadata;
			}
		}),
	};

	return { store, runs, queryRows, pageRows };
}

function qrow(date: string, query: string): SearchConsoleRow {
	return { keys: [date, query], clicks: 1, impressions: 10, ctr: 0.1, position: 5 };
}
function prow(date: string, page: string, query: string): SearchConsoleRow {
	return { keys: [date, page, query], clicks: 1, impressions: 8, ctr: 0.12, position: 4 };
}

function deps(
	store: SeoSyncStore,
	queryRows: SearchConsoleRow[],
	pageRows: SearchConsoleRow[] = [],
	extra: Partial<SyncSearchConsoleDeps> = {},
): SyncSearchConsoleDeps {
	return {
		store,
		fetchRows: vi.fn(async () => queryRows),
		fetchPageRows: vi.fn(async () => pageRows),
		...extra,
	};
}

const INPUT = {
	propertyId: PROPERTY_ID,
	startDate: "2026-07-24",
	endDate: "2026-07-31",
	syncType: "scheduled" as const,
};

describe("syncSearchConsoleProperty", () => {
	it("syncs both datasets and reports both counts", async () => {
		const { store, runs, queryRows, pageRows } = makeStore();
		const d = deps(
			store,
			[qrow("2026-07-24", "a"), qrow("2026-07-25", "b")],
			[prow("2026-07-24", "/", "a"), prow("2026-07-24", "/x", "a"), prow("2026-07-25", "/", "b")],
		);

		const result = await syncSearchConsoleProperty(INPUT, d);

		expect(result.status).toBe("success");
		expect(result.queryRowsSynced).toBe(2);
		expect(result.pageQueryRowsSynced).toBe(3);
		expect(queryRows.size).toBe(2);
		expect(pageRows.size).toBe(3);
		expect(Array.from(runs.values())[0].status).toBe("success");
	});

	it("skips malformed rows in both datasets and records counts", async () => {
		const { store, runs } = makeStore();
		const d = deps(
			store,
			[
				qrow("2026-07-24", "a"),
				{ keys: ["2026-07-24"], clicks: 0, impressions: 0, ctr: 0, position: 0 },
			],
			[
				prow("2026-07-24", "/", "a"),
				{ keys: ["2026-07-24", "/"], clicks: 0, impressions: 0, ctr: 0, position: 0 },
			],
		);

		const result = await syncSearchConsoleProperty(INPUT, d);

		expect(result.queryRowsSynced).toBe(1);
		expect(result.pageQueryRowsSynced).toBe(1);
		expect(result.skippedRows).toBe(2); // one skipped per dataset
		expect(Array.from(runs.values())[0].metadata).toMatchObject({
			querySkipped: 1,
			pageSkipped: 1,
		});
	});

	it("marks the run partial when the page-query dataset fails (query preserved)", async () => {
		const { store, runs, queryRows } = makeStore();
		const d = deps(store, [qrow("2026-07-24", "a")], [], {
			fetchPageRows: vi.fn(async () => Promise.reject(new Error("page dataset boom"))),
		});

		const result = await syncSearchConsoleProperty(INPUT, d);

		expect(result.status).toBe("partial");
		expect(result.queryRowsSynced).toBe(1);
		expect(queryRows.size).toBe(1); // preserved
		expect(Array.from(runs.values())[0].status).toBe("partial");
		expect(store.failRun).not.toHaveBeenCalled();
	});

	it("marks the run partial when the query dataset fails (page preserved)", async () => {
		const { store, pageRows } = makeStore();
		const d = deps(store, [], [prow("2026-07-24", "/", "a")], {
			fetchRows: vi.fn(async () => Promise.reject(new Error("query dataset boom"))),
		});

		const result = await syncSearchConsoleProperty(INPUT, d);

		expect(result.status).toBe("partial");
		expect(result.pageQueryRowsSynced).toBe(1);
		expect(pageRows.size).toBe(1);
	});

	it("marks failed and rethrows when both datasets fail", async () => {
		const { store, runs } = makeStore();
		const d: SyncSearchConsoleDeps = {
			store,
			fetchRows: vi.fn(async () => Promise.reject(new Error("q boom"))),
			fetchPageRows: vi.fn(async () => Promise.reject(new Error("p boom"))),
		};

		await expect(syncSearchConsoleProperty(INPUT, d)).rejects.toThrow(/q boom.*p boom/);
		expect(Array.from(runs.values())[0].status).toBe("failed");
		expect(store.failRun).toHaveBeenCalled();
	});

	it("rejects when another run is active and recent (no new run started)", async () => {
		const { store } = makeStore({ activeRun: { id: "old", started_at: new Date().toISOString() } });
		const d = deps(store, [qrow("2026-07-24", "a")]);

		await expect(syncSearchConsoleProperty(INPUT, d)).rejects.toBeInstanceOf(SeoSyncConflictError);
		expect(store.startRun).not.toHaveBeenCalled();
	});

	it("recovers a stale active run and proceeds", async () => {
		const staleStart = new Date(Date.now() - 45 * 60 * 1000).toISOString();
		const { store } = makeStore({ activeRun: { id: "stale", started_at: staleStart } });
		const d = deps(store, [qrow("2026-07-24", "a")]);

		const result = await syncSearchConsoleProperty(INPUT, d);

		expect(store.failRun).toHaveBeenCalledWith("stale", expect.stringContaining("stale threshold"));
		expect(store.startRun).toHaveBeenCalled();
		expect(result.status).toBe("success");
	});

	it("is idempotent — re-running the same window does not grow row counts", async () => {
		const { store, queryRows, pageRows } = makeStore();
		const q = [qrow("2026-07-24", "a"), qrow("2026-07-25", "b")];
		const p = [prow("2026-07-24", "/", "a")];

		await syncSearchConsoleProperty(INPUT, deps(store, q, p));
		await syncSearchConsoleProperty(INPUT, deps(store, q, p));

		expect(queryRows.size).toBe(2);
		expect(pageRows.size).toBe(1);
	});

	it("batches upserts by the configured size", async () => {
		const { store } = makeStore();
		const q = [qrow("2026-07-24", "a"), qrow("2026-07-25", "b"), qrow("2026-07-26", "c")];
		const d = deps(store, q, [], { batchSize: 2 });

		await syncSearchConsoleProperty(INPUT, d);

		expect(store.upsertQueryDaily).toHaveBeenCalledTimes(2); // 2 + 1
	});

	it("throws when the property does not exist", async () => {
		const { store } = makeStore({ property: null });
		const d = deps(store, []);

		await expect(syncSearchConsoleProperty(INPUT, d)).rejects.toThrow(/property not found/i);
		expect(store.startRun).not.toHaveBeenCalled();
	});
});
