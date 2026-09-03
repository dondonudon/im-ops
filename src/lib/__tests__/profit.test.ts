import { describe, expect, it } from "vitest";
import { type JobProfitRow, summarizeProfit } from "@/lib/profit";

const row = (revenue: number, actual_spend: number): JobProfitRow => ({
	revenue,
	actual_spend,
	current_profit: revenue - actual_spend,
});

describe("summarizeProfit", () => {
	it("derives gross, operating, and both margins from job rows + overhead", () => {
		// Mirrors the screenshotted September: one job 1.7M revenue, 910k cost,
		// plus 127k operational overhead.
		const s = summarizeProfit([row(1_700_000, 910_000)], 127_000);

		expect(s.completedRevenue).toBe(1_700_000);
		expect(s.jobCost).toBe(910_000);
		expect(s.grossProfit).toBe(790_000);
		expect(s.operationalTotal).toBe(127_000);
		expect(s.totalCost).toBe(1_037_000);
		expect(s.operatingProfit).toBe(663_000); // the actual bottom line
		expect(s.grossMargin).toBe(46); // 790k / 1.7M
		expect(s.operatingMargin).toBe(39); // 663k / 1.7M
	});

	it("sums multiple jobs and treats operating = gross − overhead", () => {
		const s = summarizeProfit([row(3_000_000, 1_000_000), row(2_000_000, 1_500_000)], 500_000);

		expect(s.grossProfit).toBe(2_500_000);
		expect(s.operatingProfit).toBe(2_000_000);
	});

	it("returns null margins when there is no completed revenue", () => {
		const s = summarizeProfit([], 250_000);

		expect(s.completedRevenue).toBe(0);
		expect(s.grossProfit).toBe(0);
		expect(s.operatingProfit).toBe(-250_000); // overhead with no revenue is a loss
		expect(s.grossMargin).toBeNull();
		expect(s.operatingMargin).toBeNull();
	});

	it("tolerates null numeric fields", () => {
		const s = summarizeProfit([{ revenue: null, actual_spend: null, current_profit: null }], 0);

		expect(s.completedRevenue).toBe(0);
		expect(s.operatingProfit).toBe(0);
	});
});
