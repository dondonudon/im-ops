import type { Database } from "@/lib/supabase/types";

type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];

/** The columns the operational expense UI reads. */
export type OperationalExpense = Pick<
	ExpenseRow,
	"id" | "category" | "description" | "amount" | "incurred_at" | "receipt_url"
>;

/** Shared select list — keeps the query and the type in sync. */
export const OPERATIONAL_EXPENSE_COLUMNS =
	"id, category, description, amount, incurred_at, receipt_url";

/** Editable fields, held as strings while the form is open. */
export type ExpenseFormState = {
	amount: string;
	category: string;
	note: string;
	date: string;
};

export function formStateFrom(expense: OperationalExpense): ExpenseFormState {
	return {
		amount: String(expense.amount),
		category: expense.category,
		note: expense.description ?? "",
		date: expense.incurred_at,
	};
}

/** Newest first — matches the server-side ordering after an optimistic insert. */
export function byNewest(a: OperationalExpense, b: OperationalExpense): number {
	return b.incurred_at.localeCompare(a.incurred_at);
}
