import { describe, expect, it } from "vitest";
import {
	billableLeaves,
	deriveInvoiceStatus,
	deriveJobRevenue,
	rollupMasterPaid,
	splitSumStatus,
} from "@/lib/invoices";

// ---------------------------------------------------------------------------
// deriveJobRevenue
// ---------------------------------------------------------------------------
describe("deriveJobRevenue", () => {
	it("returns base when there are no adjustments", () => {
		expect(deriveJobRevenue(5_000_000, [])).toBe(5_000_000);
	});

	it("adds positive adjustments (overtime)", () => {
		expect(deriveJobRevenue(5_000_000, [{ amount: 1_000_000 }])).toBe(6_000_000);
	});

	it("applies negative adjustments (discount)", () => {
		expect(deriveJobRevenue(5_000_000, [{ amount: 1_000_000 }, { amount: -500_000 }])).toBe(
			5_500_000,
		);
	});
});

// ---------------------------------------------------------------------------
// splitSumStatus
// ---------------------------------------------------------------------------
describe("splitSumStatus", () => {
	it("ok when children sum equals the master", () => {
		expect(splitSumStatus([1_800_000, 4_200_000], 6_000_000)).toBe("ok");
	});

	it("under when children sum is below the master", () => {
		expect(splitSumStatus([1_800_000], 6_000_000)).toBe("under");
	});

	it("over when children sum exceeds the master", () => {
		expect(splitSumStatus([4_000_000, 4_000_000], 6_000_000)).toBe("over");
	});

	it("under (not ok) when there are no children yet", () => {
		expect(splitSumStatus([], 6_000_000)).toBe("under");
	});
});

// ---------------------------------------------------------------------------
// deriveInvoiceStatus
// ---------------------------------------------------------------------------
describe("deriveInvoiceStatus", () => {
	it("sent when nothing is paid", () => {
		expect(deriveInvoiceStatus(0, 1_000_000)).toBe("sent");
	});

	it("partially_paid when some is paid", () => {
		expect(deriveInvoiceStatus(400_000, 1_000_000)).toBe("partially_paid");
	});

	it("paid when paid meets or exceeds total", () => {
		expect(deriveInvoiceStatus(1_000_000, 1_000_000)).toBe("paid");
		expect(deriveInvoiceStatus(1_200_000, 1_000_000)).toBe("paid");
	});

	it("cancelled sticks regardless of amounts", () => {
		expect(deriveInvoiceStatus(1_000_000, 1_000_000, true)).toBe("cancelled");
	});
});

// ---------------------------------------------------------------------------
// rollupMasterPaid
// ---------------------------------------------------------------------------
describe("rollupMasterPaid", () => {
	it("sums children paid amounts", () => {
		expect(rollupMasterPaid([1_800_000, 2_000_000], 0)).toBe(3_800_000);
	});

	it("includes a stray direct payment on the master", () => {
		expect(rollupMasterPaid([1_800_000], 500_000)).toBe(2_300_000);
	});

	it("is zero with no children and no direct payments", () => {
		expect(rollupMasterPaid([], 0)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// billableLeaves
// ---------------------------------------------------------------------------
describe("billableLeaves", () => {
	const master = { id: "m", parent_invoice_id: null };
	const dp = { id: "dp", parent_invoice_id: "m" };
	const pelunasan = { id: "pl", parent_invoice_id: "m" };
	const standalone = { id: "s", parent_invoice_id: null };

	it("excludes a master that has children, keeps the children", () => {
		const leaves = billableLeaves([master, dp, pelunasan]);
		expect(leaves.map((i) => i.id).sort()).toEqual(["dp", "pl"]);
	});

	it("keeps a standalone invoice (no children)", () => {
		expect(billableLeaves([standalone]).map((i) => i.id)).toEqual(["s"]);
	});

	it("handles a mix of standalone + master-with-children", () => {
		const leaves = billableLeaves([master, dp, pelunasan, standalone]);
		expect(leaves.map((i) => i.id).sort()).toEqual(["dp", "pl", "s"]);
	});
});
