"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ReceiptLightbox } from "@/components/shared/ReceiptLightbox";
import { Button, Card, CardHeader, EmptyState, FormError } from "@/components/ui";
import {
	categoryKeyByValue,
	DEFAULT_OPERATIONAL_CATEGORY,
	OPERATIONAL_EXPENSE_CATEGORIES,
} from "@/lib/expenseCategories";
import { useReceiptUrls } from "@/lib/useReceiptUrls";
import { formatRupiah, todayInJakarta } from "@/lib/utils";
import { OperationalExpenseForm } from "./OperationalExpenseForm";
import { OperationalExpenseRow } from "./OperationalExpenseRow";
import {
	type ExpenseFormState,
	formStateFrom,
	type OperationalExpense,
} from "./operationalExpense";
import { useOperationalExpenses } from "./useOperationalExpenses";

export type { OperationalExpense };

const CATEGORY_KEYS = categoryKeyByValue(OPERATIONAL_EXPENSE_CATEGORIES);

function emptyForm(): ExpenseFormState {
	return { amount: "", category: DEFAULT_OPERATIONAL_CATEGORY, note: "", date: todayInJakarta() };
}

/**
 * Operational (non-job) expenses for one month — bulk packing materials, ads,
 * utilities. Rows carry `job_id = NULL` and `expense_type = 'operational'`; the
 * CHECK constraints from migration 008 reject anything else, so a mistake fails
 * at the DB rather than silently polluting job profit.
 *
 * Not wired to the offline expense queue: these are logged from the office, and
 * the queue's payload is job-shaped.
 *
 * Callers should pass `key={month}` so switching months remounts with fresh rows.
 */
export function OperationalExpensesPanel({
	monthLabel,
	expenses: initial,
}: {
	monthLabel: string;
	expenses: OperationalExpense[];
}) {
	const t = useTranslations("panels.operationalExpenses");
	const tButtons = useTranslations("common.buttons");
	const tCategory = useTranslations("entity.expenseCategory");

	const { supabase, expenses, create, update, remove, saving, error, setError, isPending } =
		useOperationalExpenses(initial);
	const receiptUrls = useReceiptUrls(supabase, expenses);

	const [addForm, setAddForm] = useState<ExpenseFormState | null>(null);
	const [editing, setEditing] = useState<{ id: string; form: ExpenseFormState } | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

	const total = expenses.reduce((sum, e) => sum + e.amount, 0);

	function categoryLabel(category: string): string {
		const key = CATEGORY_KEYS[category] ?? category.toLowerCase().replace(/[\s-]+/g, "_");
		return tCategory.has(key as never) ? tCategory(key as never) : category;
	}

	async function submitAdd(form: ExpenseFormState) {
		if (await create(form, file)) {
			setAddForm(null);
			setFile(null);
		}
	}

	async function submitEdit(id: string, form: ExpenseFormState) {
		if (await update(id, form)) setEditing(null);
	}

	async function confirmDelete(id: string) {
		await remove(id);
		setDeletingId(null);
	}

	return (
		<Card>
			<CardHeader
				title={`${t("title")} — ${monthLabel}`}
				action={
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setAddForm((prev) => (prev ? null : emptyForm()));
							setError(null);
						}}
					>
						{addForm ? tButtons("cancel") : t("add")}
					</Button>
				}
			/>

			<div className="p-5 space-y-4">
				{addForm && (
					<OperationalExpenseForm
						value={addForm}
						onChange={setAddForm}
						onSubmit={() => submitAdd(addForm)}
						onFileChange={setFile}
						saving={saving}
						error={error}
					/>
				)}

				{expenses.length === 0 ? (
					<EmptyState title={t("empty")} className="py-4" />
				) : (
					<div className="space-y-2">
						{expenses.map((expense) =>
							editing?.id === expense.id ? (
								<OperationalExpenseForm
									key={expense.id}
									value={editing.form}
									onChange={(form) => setEditing({ id: expense.id, form })}
									onSubmit={() => submitEdit(expense.id, editing.form)}
									onCancel={() => setEditing(null)}
									saving={saving}
									error={error}
								/>
							) : (
								<OperationalExpenseRow
									key={expense.id}
									expense={expense}
									categoryLabel={categoryLabel(expense.category)}
									receiptUrl={receiptUrls.get(expense.id)}
									confirmingDelete={deletingId === expense.id}
									onViewReceipt={setLightboxUrl}
									onEdit={() => setEditing({ id: expense.id, form: formStateFrom(expense) })}
									onRequestDelete={() => setDeletingId(expense.id)}
									onConfirmDelete={() => confirmDelete(expense.id)}
								/>
							),
						)}

						<div className="flex justify-between pt-2 text-sm font-semibold">
							<span className="text-ink">{t("total")}</span>
							<span className="tabular-nums text-ink">{formatRupiah(total)}</span>
						</div>
					</div>
				)}

				{!addForm && !editing && error && <FormError>{error}</FormError>}
			</div>

			{lightboxUrl && (
				<ReceiptLightbox
					url={lightboxUrl}
					onClose={() => setLightboxUrl(null)}
					label={t("viewReceipt")}
					closeLabel={tButtons("close")}
				/>
			)}

			{isPending && <span className="sr-only">{tButtons("saving")}</span>}
		</Card>
	);
}
