import { Briefcase, Receipt, Sigma } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { OperationalExpensesPanel } from "@/components/money/OperationalExpensesPanel";
import {
	OPERATIONAL_EXPENSE_COLUMNS,
	type OperationalExpense,
} from "@/components/money/operationalExpense";
import { MonthPicker, PageHeader, Stat } from "@/components/ui";
import { formatMonthLabel, monthRange, parseMonth } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/utils";

/**
 * Operational (non-job) expenses — overhead the business carries regardless of
 * any single move: bulk packing materials, ads, utilities, office supplies.
 *
 * Job expenses are deliberately NOT here. They belong to the job that incurred
 * them and are logged by crews at /jobs/[id]/expenses.
 */
export default async function ExpensesPage({
	searchParams,
}: {
	searchParams: Promise<{ month?: string }>;
}) {
	const { month: rawMonth } = await searchParams;
	const selectedMonth = parseMonth(rawMonth);
	const { start: monthStart, end: monthEnd } = monthRange(selectedMonth);

	const t = await getTranslations("pages.expenses");
	const supabase = await createClient();

	const monthLabel = formatMonthLabel(selectedMonth, await getLocale());

	// One query for the whole month, partitioned below. Job rows are only needed as
	// a comparison total, so a second round-trip would buy nothing.
	const { data: monthExpenses } = await supabase
		.from("expenses")
		.select(`${OPERATIONAL_EXPENSE_COLUMNS}, expense_type`)
		.gte("incurred_at", monthStart)
		.lt("incurred_at", monthEnd)
		.order("incurred_at", { ascending: false });

	const expenses: OperationalExpense[] = [];
	let operationalTotal = 0;
	let jobTotal = 0;
	for (const { expense_type, ...expense } of monthExpenses ?? []) {
		if (expense_type === "operational") {
			expenses.push(expense);
			operationalTotal += expense.amount;
		} else {
			jobTotal += expense.amount;
		}
	}

	return (
		<div className="space-y-5">
			<PageHeader
				title={t("title")}
				subtitle={t("subtitle")}
				actions={<MonthPicker value={selectedMonth} />}
			/>

			<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
				<Stat
					icon={<Receipt size={16} />}
					tone="neutral"
					label={t("operationalTotal")}
					value={formatRupiah(operationalTotal)}
					sub={t("operationalTotalSub", { count: expenses.length })}
				/>
				<Stat
					icon={<Briefcase size={16} />}
					tone="neutral"
					label={t("jobTotal")}
					value={formatRupiah(jobTotal)}
					sub={t("jobTotalSub")}
					href="/reports"
				/>
				<Stat
					icon={<Sigma size={16} />}
					tone="neutral"
					label={t("combinedTotal")}
					value={formatRupiah(operationalTotal + jobTotal)}
					sub={t("combinedTotalSub")}
				/>
			</div>

			<OperationalExpensesPanel key={selectedMonth} monthLabel={monthLabel} expenses={expenses} />
		</div>
	);
}
