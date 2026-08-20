"use client";
import { useTranslations } from "next-intl";
import { NumericInput } from "@/components/shared/NumericInput";
import { Button, Field, FormError, Input } from "@/components/ui";
import { OPERATIONAL_EXPENSE_CATEGORIES } from "@/lib/expenseCategories";
import type { ExpenseFormState } from "./operationalExpense";

/**
 * Add/edit form for an operational expense. Controlled by the parent so the same
 * markup serves both the create form and an inline row edit; `onFileChange` is
 * omitted when editing (receipts are replaced by deleting and re-adding).
 */
export function OperationalExpenseForm({
	value,
	onChange,
	onSubmit,
	onCancel,
	onFileChange,
	saving,
	error,
}: {
	value: ExpenseFormState;
	onChange: (next: ExpenseFormState) => void;
	onSubmit: () => void;
	onCancel?: () => void;
	onFileChange?: (file: File | null) => void;
	saving: boolean;
	error: string | null;
}) {
	const t = useTranslations("panels.operationalExpenses");
	const tButtons = useTranslations("common.buttons");
	const tCategory = useTranslations("entity.expenseCategory");

	function patch(next: Partial<ExpenseFormState>) {
		onChange({ ...value, ...next });
	}

	return (
		<form
			className="space-y-3 rounded-lg bg-surface-sunken p-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<Field label={t("amount")}>
					<NumericInput
						value={Number(value.amount) || 0}
						onChange={(n) => patch({ amount: String(n) })}
						required
					/>
				</Field>
				<Field label={t("date")}>
					<Input
						type="date"
						value={value.date}
						onChange={(e) => patch({ date: e.target.value })}
						required
					/>
				</Field>
			</div>

			<Field label={t("category")}>
				<div className="flex flex-wrap gap-2">
					{OPERATIONAL_EXPENSE_CATEGORIES.map((c) => (
						<button
							key={c.value}
							type="button"
							onClick={() => patch({ category: c.value })}
							aria-pressed={value.category === c.value}
							className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
								value.category === c.value
									? "bg-primary text-primary-fg"
									: "bg-surface text-ink-muted hover:text-ink border border-line"
							}`}
						>
							{tCategory.has(c.key as never) ? tCategory(c.key as never) : c.value}
						</button>
					))}
				</div>
			</Field>

			<Field label={t("description")}>
				<Input
					value={value.note}
					onChange={(e) => patch({ note: e.target.value })}
					placeholder={t("descriptionPlaceholder")}
				/>
			</Field>

			{onFileChange && (
				<Field label={t("receipt")} hint={t("receiptHint")}>
					<input
						type="file"
						accept="image/*"
						onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
						className="block w-full text-xs text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink"
					/>
				</Field>
			)}

			{error && <FormError>{error}</FormError>}

			<div className="flex gap-2">
				<Button type="submit" loading={saving} size="sm">
					{tButtons("save")}
				</Button>
				{onCancel && (
					<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
						{tButtons("cancel")}
					</Button>
				)}
			</div>
		</form>
	);
}
