import { describe, expect, it } from "vitest";
import { chunk, normalizePageQueryRows, normalizeQueryRows } from "@/lib/search-console/normalize";
import type { SearchConsoleRow } from "@/lib/search-console/types";

function scRow(
	keys: string[] | undefined,
	extra: Partial<SearchConsoleRow> = {},
): SearchConsoleRow {
	return { keys, clicks: 2, impressions: 40, ctr: 0.05, position: 6.5, ...extra };
}

describe("normalizeQueryRows", () => {
	it("maps [date, query] rows and drops ctr", () => {
		const { rows, skipped } = normalizeQueryRows([
			scRow(["2026-07-01", "jasa pindah semarang"], { clicks: 3, impressions: 50, position: 4.2 }),
		]);
		expect(skipped).toBe(0);
		expect(rows[0]).toEqual({
			metric_date: "2026-07-01",
			query: "jasa pindah semarang",
			clicks: 3,
			impressions: 50,
			position: 4.2,
		});
		expect(rows[0]).not.toHaveProperty("ctr");
	});

	it("skips and counts rows with missing keys", () => {
		const { rows, skipped } = normalizeQueryRows([
			scRow(["2026-07-01", "ok"]),
			scRow(["2026-07-01"]), // missing query
			scRow(undefined), // missing keys entirely
			scRow(["", "blank date"]), // empty date
		]);
		expect(rows).toHaveLength(1);
		expect(skipped).toBe(3);
	});
});

describe("normalizePageQueryRows", () => {
	it("maps [date, page, query] rows", () => {
		const { rows, skipped } = normalizePageQueryRows([
			{
				keys: ["2026-07-01", "/", "jasa pindah"],
				clicks: 1,
				impressions: 20,
				ctr: 0.05,
				position: 3,
			},
		]);
		expect(skipped).toBe(0);
		expect(rows[0]).toEqual({
			metric_date: "2026-07-01",
			page: "/",
			query: "jasa pindah",
			clicks: 1,
			impressions: 20,
			position: 3,
		});
	});

	it("skips rows missing any of the three keys", () => {
		const { rows, skipped } = normalizePageQueryRows([
			{ keys: ["2026-07-01", "/", "ok"], clicks: 0, impressions: 0, ctr: 0, position: 0 },
			{ keys: ["2026-07-01", "/"], clicks: 0, impressions: 0, ctr: 0, position: 0 }, // missing query
			{ keys: undefined, clicks: 0, impressions: 0, ctr: 0, position: 0 },
		]);
		expect(rows).toHaveLength(1);
		expect(skipped).toBe(2);
	});
});

describe("chunk", () => {
	it("splits into fixed-size batches with a smaller tail", () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});

	it("returns a single chunk when size exceeds length", () => {
		expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
	});

	it("returns [] for empty input", () => {
		expect(chunk([], 3)).toEqual([]);
	});

	it("throws on a non-positive size", () => {
		expect(() => chunk([1], 0)).toThrowError();
	});
});
