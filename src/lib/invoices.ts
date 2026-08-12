/**
 * Pure money helpers for split invoices (master + termin children) and job
 * change-orders. No I/O — the DB triggers are the source of truth at write time;
 * these mirror that logic so the UI can compute/preview and tests can assert it.
 *
 * See docs/split-invoices-and-change-orders-plan.md.
 */

/** Derived job revenue = base contracted amount + Σ signed adjustments. */
export function deriveJobRevenue(baseRevenue: number, adjustments: { amount: number }[]): number {
	return adjustments.reduce((sum, a) => sum + a.amount, baseRevenue);
}

export type SplitSum = "ok" | "under" | "over";

/**
 * Compare Σ children totals against the master total.
 * `under` = not fully allocated yet; `over` = children exceed the master.
 * Mismatch is a warn-but-allow signal, never a hard block.
 */
export function splitSumStatus(childrenTotals: number[], masterTotal: number): SplitSum {
	const sum = childrenTotals.reduce((s, t) => s + t, 0);
	if (sum === masterTotal) return "ok";
	return sum < masterTotal ? "under" : "over";
}

export type InvoiceStatus = "sent" | "partially_paid" | "paid";

/**
 * Derive an invoice's lifecycle status from paid vs total. Mirrors the
 * recompute_invoice_paid() trigger: cancelled sticks; paid >= total → paid;
 * any paid → partially_paid; else sent. (overdue is derived at read time, not here.)
 */
export function deriveInvoiceStatus(
	paid: number,
	total: number,
	cancelled = false,
): InvoiceStatus | "cancelled" {
	if (cancelled) return "cancelled";
	if (paid >= total) return "paid";
	if (paid > 0) return "partially_paid";
	return "sent";
}

/**
 * A master's paid amount rolls up its children plus any of its own direct
 * payments (the latter is normally 0 — only non-zero for a standalone invoice
 * that was split after taking payments, so money is never lost).
 */
export function rollupMasterPaid(childrenPaid: number[], directPaid: number): number {
	return childrenPaid.reduce((s, p) => s + p, directPaid);
}

/**
 * De-dup for display/AR: given a job's invoices, return the billable *leaves* —
 * standalone invoices and children — dropping any master that has children
 * (its amount overlaps the children it rolls up).
 */
export function billableLeaves<T extends { id: string; parent_invoice_id: string | null }>(
	invoices: T[],
): T[] {
	const parentIds = new Set(
		invoices.map((i) => i.parent_invoice_id).filter((id): id is string => id != null),
	);
	return invoices.filter((i) => !parentIds.has(i.id));
}
