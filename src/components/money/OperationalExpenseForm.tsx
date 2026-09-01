"use client";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { Button, Field, FormError, Input } from "@/components/ui";
import { OPERATIONAL_EXPENSE_CATEGORIES } from "@/lib/expenseCategories";
import type { ExpenseFormState } from "./operationalExpense";

export function OperationalExpenseForm({
	value,
	onChange,
	onSubmit,
	onCancel,
	onFileChange,
	hasReceipt,
	existingReceiptUrl,
	receiptRemoved,
	onReceiptRemoveChange,
	saving,
	error,
}: {
	value: ExpenseFormState;
	onChange: (next: ExpenseFormState) => void;
	onSubmit: () => void;
	onCancel?: () => void;
	onFileChange?: (file: File | null) => void;
	hasReceipt?: boolean;
	existingReceiptUrl?: string;
	receiptRemoved?: boolean;
	onReceiptRemoveChange?: (v: boolean) => void;
	saving: boolean;
	error: string | null;
}) {
	const t = useTranslations("panels.operationalExpenses");
	const tButtons = useTranslations("common.buttons");
	const tHints = useTranslations("common.hints");
	const tCategory = useTranslations("entity.expenseCategory");

	const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

	function patch(next: Partial<ExpenseFormState>) {
		onChange({ ...value, ...next });
	}

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0] ?? null;
		setSelectedFileName(f?.name ?? null);
		onFileChange?.(f);
		if (f) onReceiptRemoveChange?.(false);
	}

	const isEditing = !!onCancel;
	const showExisting = isEditing && hasReceipt && !receiptRemoved && !selectedFileName;
	const showRemoveUndo = isEditing && hasReceipt && receiptRemoved && !selectedFileName;

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
				<div>
					<p className="text-sm font-medium text-ink mb-1.5">
						{t("receipt")}{" "}
						<span className="text-ink-faint font-normal">{tHints("optionalParen")}</span>
					</p>

					{/* Existing receipt thumbnail */}
					{showExisting && (
						<div className="mb-2 rounded-lg overflow-hidden border border-line bg-surface">
							<button
								type="button"
								aria-label={t("viewReceipt")}
								className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
							>
								{existingReceiptUrl ? (
									<Image
										src={existingReceiptUrl}
										alt={t("viewReceipt")}
										width={600}
										height={400}
										className="w-full max-h-40 object-contain"
									/>
								) : (
									<div className="w-full h-24 animate-pulse bg-surface-sunken" />
								)}
							</button>
							<div className="flex items-center gap-2 px-3 py-1.5 border-t border-line">
								<span className="text-xs text-ink-faint flex-1">{t("receipt")}</span>
								<button
									type="button"
									onClick={() => onReceiptRemoveChange?.(true)}
									className="text-xs text-danger-text hover:underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
								>
									{tButtons("remove")}
								</button>
							</div>
						</div>
					)}

					{/* Marked for removal */}
					{showRemoveUndo && (
						<div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-surface border border-line">
							<span className="text-sm text-ink-faint line-through flex-1">
								{t("receiptMarkedForRemoval")}
							</span>
							<button
								type="button"
								onClick={() => onReceiptRemoveChange?.(false)}
								className="text-xs text-primary-text hover:underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
							>
								{tButtons("cancel")}
							</button>
						</div>
					)}

					{/* File input */}
					<input
						type="file"
						accept="image/*"
						onChange={handleFileChange}
						className="block w-full text-xs text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink"
					/>
					{selectedFileName && <p className="text-xs text-ink-faint mt-1">{selectedFileName}</p>}
					{!isEditing && <p className="text-xs text-ink-faint mt-1">{t("receiptHint")}</p>}
				</div>
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
