import { describe, expect, it } from "vitest";
import type { QueryAggregate, QueryPageShare } from "@/lib/search-console/aggregate";
import { detectOpportunities, type OpportunityInputs } from "@/lib/search-console/opportunities";

function qa(query: string, over: Partial<QueryAggregate> = {}): QueryAggregate {
	return { query, clicks: 0, impressions: 0, ctr: 0, position: null, ...over };
}

function baseInputs(over: Partial<OpportunityInputs> = {}): OpportunityInputs {
	return {
		queryAggregates: [],
		queryPageShares: [],
		targetKeywords: [],
		previousPositionByKeyword: new Map(),
		currentPositionByKeyword: new Map(),
		...over,
	};
}

const typesOf = (inputs: OpportunityInputs) => detectOpportunities(inputs).map((o) => o.type);

describe("detectOpportunities — near page one", () => {
	it("flags position 10–20 with enough impressions", () => {
		const found = detectOpportunities(
			baseInputs({ queryAggregates: [qa("k", { position: 14, impressions: 30 })] }),
		);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ type: "near_page_one", priority: "high", query: "k" });
	});
	it("ignores when impressions are below threshold", () => {
		expect(
			typesOf(baseInputs({ queryAggregates: [qa("k", { position: 14, impressions: 5 })] })),
		).not.toContain("near_page_one");
	});
	it("ignores when already on page one", () => {
		expect(
			typesOf(baseInputs({ queryAggregates: [qa("k", { position: 6, impressions: 100 })] })),
		).not.toContain("near_page_one");
	});
});

describe("detectOpportunities — low CTR", () => {
	it("flags page-one, high-impression, low-CTR queries", () => {
		const found = detectOpportunities(
			baseInputs({ queryAggregates: [qa("k", { position: 4, impressions: 200, ctr: 0.01 })] }),
		);
		expect(found[0]).toMatchObject({ type: "low_ctr", priority: "medium" });
	});
	it("does not flag healthy CTR", () => {
		expect(
			typesOf(
				baseInputs({ queryAggregates: [qa("k", { position: 4, impressions: 200, ctr: 0.08 })] }),
			),
		).not.toContain("low_ctr");
	});
});

describe("detectOpportunities — unexpected page", () => {
	it("flags a target keyword ranking mainly on a non-target page", () => {
		const shares: QueryPageShare[] = [
			{
				query: "k",
				totalImpressions: 100,
				pages: [
					{ page: "/wrong", impressions: 90, share: 0.9 },
					{ page: "/", impressions: 10, share: 0.1 },
				],
			},
		];
		const found = detectOpportunities(
			baseInputs({ queryPageShares: shares, targetKeywords: [{ keyword: "k", targetPage: "/" }] }),
		);
		expect(found[0]).toMatchObject({ type: "unexpected_page", query: "k", page: "/wrong" });
	});
	it("treats '/' and 'https://site/' as the same page", () => {
		const shares: QueryPageShare[] = [
			{
				query: "k",
				totalImpressions: 100,
				pages: [{ page: "https://indo-mover.com/", impressions: 100, share: 1 }],
			},
		];
		expect(
			typesOf(
				baseInputs({
					queryPageShares: shares,
					targetKeywords: [{ keyword: "k", targetPage: "/" }],
				}),
			),
		).not.toContain("unexpected_page");
	});
});

describe("detectOpportunities — cannibalization", () => {
	it("flags a query split across two strong pages", () => {
		const shares: QueryPageShare[] = [
			{
				query: "k",
				totalImpressions: 100,
				pages: [
					{ page: "/a", impressions: 55, share: 0.55 },
					{ page: "/b", impressions: 45, share: 0.45 },
				],
			},
		];
		const found = detectOpportunities(baseInputs({ queryPageShares: shares }));
		expect(found[0]).toMatchObject({
			type: "cannibalization",
			page: "/a",
			metrics: { otherPage: "/b" },
		});
	});
	it("does not flag a single dominant page", () => {
		const shares: QueryPageShare[] = [
			{
				query: "k",
				totalImpressions: 100,
				pages: [
					{ page: "/a", impressions: 95, share: 0.95 },
					{ page: "/b", impressions: 5, share: 0.05 },
				],
			},
		];
		expect(typesOf(baseInputs({ queryPageShares: shares }))).not.toContain("cannibalization");
	});
});

describe("detectOpportunities — declining keyword", () => {
	it("flags a target keyword that dropped ≥3 positions with real impressions", () => {
		// Position 26 (not in the 10–20 near-page-one band) so only decline fires.
		const found = detectOpportunities(
			baseInputs({
				targetKeywords: [{ keyword: "k", targetPage: "/" }],
				previousPositionByKeyword: new Map([["k", 22]]),
				currentPositionByKeyword: new Map([["k", 26]]),
				queryAggregates: [qa("k", { impressions: 40, position: 26 })],
			}),
		);
		expect(found.find((o) => o.type === "declining_keyword")).toMatchObject({
			metrics: { delta: 4 },
		});
	});
	it("does not flag an improvement", () => {
		expect(
			typesOf(
				baseInputs({
					targetKeywords: [{ keyword: "k", targetPage: "/" }],
					previousPositionByKeyword: new Map([["k", 12]]),
					currentPositionByKeyword: new Map([["k", 6]]),
					queryAggregates: [qa("k", { impressions: 40, position: 6 })],
				}),
			),
		).not.toContain("declining_keyword");
	});
});

describe("detectOpportunities — ordering", () => {
	it("sorts high priority before medium and low", () => {
		const found = detectOpportunities(
			baseInputs({
				queryAggregates: [
					qa("near", { position: 15, impressions: 50 }), // high
					qa("ctr", { position: 3, impressions: 100, ctr: 0.005 }), // medium
				],
				queryPageShares: [
					{
						query: "cannibal",
						totalImpressions: 100,
						pages: [
							{ page: "/a", impressions: 50, share: 0.5 },
							{ page: "/b", impressions: 50, share: 0.5 },
						],
					},
				],
			}),
		);
		expect(found[0].priority).toBe("high");
		expect(found[found.length - 1].priority).toBe("low");
	});
});
