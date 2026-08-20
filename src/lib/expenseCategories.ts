/**
 * Expense category vocabularies, split by expense_type (migration 008).
 *
 * Categories are stored as free TEXT in `expenses.category` — the DB doesn't
 * constrain them — so these lists are the app-level source of truth for what the
 * UI offers. `value` is what lands in the column; `key` is the i18n lookup under
 * `entity.expenseCategory`.
 *
 * Job and operational expenses get different vocabularies on purpose: "Utilities"
 * makes no sense charged to a single move, and "Food" makes no sense as overhead.
 * "Packing materials" appears in both — bought per-job or in bulk.
 *
 * Historical rows may hold values absent from these lists (the old "Fuel", "Toll",
 * "Parking", …). Renderers must fall back to the raw value rather than assume a
 * key exists — see reports/page.tsx.
 */
export type ExpenseCategory = { value: string; key: string };

export const JOB_EXPENSE_CATEGORIES: ExpenseCategory[] = [
	{ value: "Food", key: "food" },
	{ value: "Labor", key: "labor" },
	{ value: "Packing materials", key: "packing_materials" },
	{ value: "Transport", key: "transport" },
	{ value: "Other", key: "other" },
];

export const OPERATIONAL_EXPENSE_CATEGORIES: ExpenseCategory[] = [
	{ value: "Packing materials", key: "packing_materials" },
	{ value: "Marketing", key: "marketing" },
	{ value: "Utilities", key: "utilities" },
	{ value: "Office supplies", key: "office_supplies" },
	{ value: "Transport", key: "transport" },
	{ value: "Other", key: "other" },
];

/** Default selection for a fresh form. */
export const DEFAULT_JOB_CATEGORY = JOB_EXPENSE_CATEGORIES[0].value;
export const DEFAULT_OPERATIONAL_CATEGORY = OPERATIONAL_EXPENSE_CATEGORIES[0].value;

export function categoryKeyByValue(categories: ExpenseCategory[]): Record<string, string> {
	return categories.reduce<Record<string, string>>((acc, c) => {
		acc[c.value] = c.key;
		return acc;
	}, {});
}
