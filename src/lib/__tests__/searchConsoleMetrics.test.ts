import { describe, expect, it } from "vitest";
import {
	aggregateCtr,
	keywordStatusBand,
	type MetricRow,
	percentChange,
	positionDelta,
	summarize,
	weightedPosition,
} from "@/lib/search-console/metrics";

function m(clicks: number, impressions: number, position: number): MetricRow {
	return { clicks, impressions, position };
}

describe("aggregateCtr", () => {
	it("is clicks/impressions", () => {
		expect(aggregateCtr(3, 60)).toBeCloseTo(0.05);
	});
	it("is 0 when there are no impressions", () => {
		expect(aggregateCtr(0, 0)).toBe(0);
	});
});

describe("weightedPosition", () => {
	it("weights by impressions, not an unweighted mean", () => {
		// position 2 @ 90 impressions, position 20 @ 10 impressions.
		// weighted = (2*90 + 20*10) / 100 = 3.8 (unweighted mean would be 11).
		expect(weightedPosition([m(0, 90, 2), m(0, 10, 20)])).toBeCloseTo(3.8);
	});
	it("returns null when there are no impressions", () => {
		expect(weightedPosition([m(0, 0, 5)])).toBeNull();
		expect(weightedPosition([])).toBeNull();
	});
});

describe("summarize", () => {
	it("aggregates clicks/impressions/ctr/position together", () => {
		const s = summarize([m(2, 40, 4), m(3, 60, 8)]);
		expect(s.clicks).toBe(5);
		expect(s.impressions).toBe(100);
		expect(s.ctr).toBeCloseTo(0.05);
		expect(s.position).toBeCloseTo((4 * 40 + 8 * 60) / 100); // 6.4
	});
	it("reports null position for an empty set", () => {
		expect(summarize([]).position).toBeNull();
	});
});

describe("percentChange", () => {
	it("computes a fractional change", () => {
		expect(percentChange(118, 100)).toBeCloseTo(0.18);
		expect(percentChange(80, 100)).toBeCloseTo(-0.2);
	});
	it("returns null when previous is 0 and current is non-zero (render 'New')", () => {
		expect(percentChange(10, 0)).toBeNull();
	});
	it("returns 0 when both are 0", () => {
		expect(percentChange(0, 0)).toBe(0);
	});
});

describe("positionDelta", () => {
	it("is previous - current (positive = improved)", () => {
		expect(positionDelta(12.4, 8.1)).toBeCloseTo(4.3);
		expect(positionDelta(5, 9)).toBeCloseTo(-4);
	});
	it("is null when either side has no data", () => {
		expect(positionDelta(null, 5)).toBeNull();
		expect(positionDelta(5, null)).toBeNull();
	});
});

describe("keywordStatusBand", () => {
	it("buckets by position with the plan's boundaries", () => {
		expect(keywordStatusBand(null)).toBe("noData");
		expect(keywordStatusBand(1)).toBe("top3");
		expect(keywordStatusBand(3)).toBe("top3");
		expect(keywordStatusBand(3.1)).toBe("page1");
		expect(keywordStatusBand(10)).toBe("page1");
		expect(keywordStatusBand(10.1)).toBe("nearPage1");
		expect(keywordStatusBand(20)).toBe("nearPage1");
		expect(keywordStatusBand(20.1)).toBe("needsWork");
		expect(keywordStatusBand(50)).toBe("needsWork");
	});
});
