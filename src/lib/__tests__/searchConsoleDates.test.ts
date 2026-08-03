import { describe, expect, it } from "vitest";
import {
	delayedSyncWindow,
	isRangePreset,
	monthChunks,
	resolveDashboardRange,
	shiftDate,
} from "@/lib/search-console/dates";

describe("shiftDate", () => {
	it("shifts forward and backward within a month", () => {
		expect(shiftDate("2026-07-10", 5)).toBe("2026-07-15");
		expect(shiftDate("2026-07-10", -5)).toBe("2026-07-05");
	});

	it("crosses month boundaries", () => {
		expect(shiftDate("2026-07-31", 1)).toBe("2026-08-01");
		expect(shiftDate("2026-08-01", -1)).toBe("2026-07-31");
	});

	it("crosses year boundaries", () => {
		expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
		expect(shiftDate("2027-01-01", -1)).toBe("2026-12-31");
	});

	it("handles leap-year February", () => {
		expect(shiftDate("2024-02-28", 1)).toBe("2024-02-29");
		expect(shiftDate("2024-02-29", 1)).toBe("2024-03-01");
		expect(shiftDate("2025-02-28", 1)).toBe("2025-03-01"); // non-leap
	});
});

describe("delayedSyncWindow", () => {
	it("defaults to 10-days-ago → 3-days-ago (per the plan example)", () => {
		expect(delayedSyncWindow("2026-08-03")).toEqual({
			startDate: "2026-07-24",
			endDate: "2026-07-31",
		});
	});

	it("respects custom lag/span", () => {
		expect(delayedSyncWindow("2026-08-03", { lagDays: 2, spanDays: 5 })).toEqual({
			startDate: "2026-07-27",
			endDate: "2026-08-01",
		});
	});
});

describe("monthChunks", () => {
	it("returns a single clamped chunk within one month", () => {
		expect(monthChunks("2026-07-05", "2026-07-20")).toEqual([
			{ startDate: "2026-07-05", endDate: "2026-07-20" },
		]);
	});

	it("splits across months, clamping first and last", () => {
		expect(monthChunks("2026-06-15", "2026-08-10")).toEqual([
			{ startDate: "2026-06-15", endDate: "2026-06-30" },
			{ startDate: "2026-07-01", endDate: "2026-07-31" },
			{ startDate: "2026-08-01", endDate: "2026-08-10" },
		]);
	});

	it("crosses a year boundary", () => {
		expect(monthChunks("2025-12-20", "2026-01-10")).toEqual([
			{ startDate: "2025-12-20", endDate: "2025-12-31" },
			{ startDate: "2026-01-01", endDate: "2026-01-10" },
		]);
	});

	it("uses the correct last day for leap February", () => {
		expect(monthChunks("2024-02-01", "2024-03-01")).toEqual([
			{ startDate: "2024-02-01", endDate: "2024-02-29" },
			{ startDate: "2024-03-01", endDate: "2024-03-01" },
		]);
	});

	it("returns [] when start is after end", () => {
		expect(monthChunks("2026-08-10", "2026-08-01")).toEqual([]);
	});
});

describe("resolveDashboardRange", () => {
	it("builds equal-length current + previous windows excluding today (28d)", () => {
		const r = resolveDashboardRange("28d", "2026-08-03");
		expect(r.days).toBe(28);
		expect(r.current).toEqual({ startDate: "2026-07-06", endDate: "2026-08-02" });
		expect(r.previous).toEqual({ startDate: "2026-06-08", endDate: "2026-07-05" });
	});

	it("supports the 3-month (90-day) preset", () => {
		const r = resolveDashboardRange("3m", "2026-08-03");
		expect(r.days).toBe(90);
		expect(r.current.endDate).toBe("2026-08-02");
		expect(r.previous.endDate).toBe("2026-05-04"); // day before current start
	});
});

describe("isRangePreset", () => {
	it("accepts known presets and rejects others", () => {
		expect(isRangePreset("28d")).toBe(true);
		expect(isRangePreset("3m")).toBe(true);
		expect(isRangePreset("7d")).toBe(false);
		expect(isRangePreset(undefined)).toBe(false);
	});
});
