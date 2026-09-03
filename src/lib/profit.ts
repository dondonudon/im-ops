// Profit model — the single source of truth for /money and /reports.
//
// Two profit figures, always computed the same way on both pages:
//   • Job gross profit = Σ (job revenue − job-scoped expenses), from job_profit_summary.
//     Accrues to the job's move_date month. Operational overhead is NOT in here —
//     the view filters expense_type = 'job' (migration 008), and it can't be, since
//     overhead has no job to attach to.
//   • Operating profit = job gross profit − operational overhead for the month.
//     Overhead (expense_type = 'operational', job_id IS NULL) has no job to accrue
//     to, so it buckets by incurred_at month. This is the actual bottom line.
//
// Callers pass the job_profit_summary rows for the completed jobs of a period plus
// that period's operational overhead total; everything else is derived here.

export type JobProfitRow = {
	job_id?: string | null;
	job_number?: string | null;
	revenue: number | null;
	actual_spend: number | null;
	current_profit: number | null;
};

export interface ProfitSummary {
	/** Σ revenue of the completed jobs in the period. */
	completedRevenue: number;
	/** Σ job-scoped expenses (job_profit_summary.actual_spend). */
	jobCost: number;
	/** completedRevenue − jobCost. */
	grossProfit: number;
	/** Operational overhead for the period (no job). */
	operationalTotal: number;
	/** jobCost + operationalTotal — the whole cost base. */
	totalCost: number;
	/** grossProfit − operationalTotal — the actual profit. */
	operatingProfit: number;
	/** grossProfit / completedRevenue, rounded %, or null when no revenue. */
	grossMargin: number | null;
	/** operatingProfit / completedRevenue, rounded %, or null when no revenue. */
	operatingMargin: number | null;
}

export function summarizeProfit(rows: JobProfitRow[], operationalTotal: number): ProfitSummary {
	const completedRevenue = rows.reduce((s, r) => s + (r.revenue ?? 0), 0);
	const jobCost = rows.reduce((s, r) => s + (r.actual_spend ?? 0), 0);
	const grossProfit = rows.reduce((s, r) => s + (r.current_profit ?? 0), 0);
	const operatingProfit = grossProfit - operationalTotal;

	return {
		completedRevenue,
		jobCost,
		grossProfit,
		operationalTotal,
		totalCost: jobCost + operationalTotal,
		operatingProfit,
		grossMargin: completedRevenue > 0 ? Math.round((grossProfit / completedRevenue) * 100) : null,
		operatingMargin:
			completedRevenue > 0 ? Math.round((operatingProfit / completedRevenue) * 100) : null,
	};
}
