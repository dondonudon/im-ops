import { describe, expect, it } from "vitest";
import {
	aggregateByPage,
	aggregateByQuery,
	queryPageDistribution,
} from "@/lib/search-console/aggregate";

describe("aggregateByQuery", () => {
	it("rolls daily rows into one weighted row per query", () => {
		const result = aggregateByQuery([
			{ query: "a", clicks: 1, impressions: 40, position: 4 },
			{ query: "a", clicks: 2, impressions: 60, position: 8 },
			{ query: "b", clicks: 0, impressions: 10, position: 12 },
		]);
		const a = result.find((r) => r.query === "a");
		expect(a).toMatchObject({ clicks: 3, impressions: 100 });
		expect(a?.position).toBeCloseTo((4 * 40 + 8 * 60) / 100); // 6.4
		expect(a?.ctr).toBeCloseTo(0.03);
	});
});

describe("aggregateByPage", () => {
	it("rolls rows per page with query count and top query", () => {
		const result = aggregateByPage([
			{ page: "/", query: "a", clicks: 1, impressions: 100, position: 5 },
			{ page: "/", query: "b", clicks: 0, impressions: 20, position: 9 },
			{ page: "/x", query: "a", clicks: 0, impressions: 5, position: 30 },
		]);
		const home = result.find((r) => r.page === "/");
		expect(home?.impressions).toBe(120);
		expect(home?.queryCount).toBe(2);
		expect(home?.topQuery).toBe("a"); // most impressions
	});
});

describe("queryPageDistribution", () => {
	it("computes per-page impression shares sorted desc", () => {
		const result = queryPageDistribution([
			{ page: "/", query: "a", clicks: 0, impressions: 80, position: 5 },
			{ page: "/x", query: "a", clicks: 0, impressions: 20, position: 12 },
		]);
		const a = result.find((r) => r.query === "a");
		expect(a?.totalImpressions).toBe(100);
		expect(a?.pages[0]).toMatchObject({ page: "/", impressions: 80 });
		expect(a?.pages[0].share).toBeCloseTo(0.8);
		expect(a?.pages[1].share).toBeCloseTo(0.2);
	});
});
