"use client";
import { Paperclip, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Money } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import type { OperationalExpense } from "./operationalExpense";

const ICON_BUTTON =
	"text-ink-faint hover:text-ink opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity";

/** One expense line: category, description, date, optional receipt, edit/delete. */
export function OperationalExpenseRow({
	expense,
	categoryLabel,
	receiptUrl,
	confirmingDelete,
	onViewReceipt,
	onEdit,
	onRequestDelete,
	onConfirmDelete,
}: {
	expense: OperationalExpense;
	categoryLabel: string;
	receiptUrl?: string;
	confirmingDelete: boolean;
	onViewReceipt: (url: string) => void;
	onEdit: () => void;
	onRequestDelete: () => void;
	onConfirmDelete: () => void;
}) {
	const t = useTranslations("panels.operationalExpenses");
	const tButtons = useTranslations("common.buttons");

	return (
		<div className="flex items-center gap-3 text-sm py-1.5 border-b border-line last:border-0 group">
			<span className="text-ink-muted w-36 shrink-0 truncate">{categoryLabel}</span>
			<span className="flex-1 min-w-0 truncate text-ink">
				{expense.description || <span className="text-ink-faint">—</span>}
				<span className="text-ink-faint ml-2 text-xs">{formatDate(expense.incurred_at)}</span>
			</span>

			{receiptUrl && (
				<button
					type="button"
					onClick={() => onViewReceipt(receiptUrl)}
					className="text-ink-faint hover:text-ink shrink-0"
					aria-label={t("viewReceipt")}
				>
					<Paperclip className="h-3.5 w-3.5" />
				</button>
			)}

			<Money value={expense.amount} className="tabular-nums font-medium shrink-0" />

			<span className="flex items-center gap-1 shrink-0">
				<button
					type="button"
					onClick={onEdit}
					className={ICON_BUTTON}
					aria-label={tButtons("edit")}
				>
					<Pencil className="h-3.5 w-3.5" />
				</button>
				{confirmingDelete ? (
					<button
						type="button"
						onClick={onConfirmDelete}
						className="text-danger-text text-xs font-medium"
					>
						{tButtons("confirm")}
					</button>
				) : (
					<button
						type="button"
						onClick={onRequestDelete}
						className={`${ICON_BUTTON} hover:text-danger-text`}
						aria-label={tButtons("delete")}
					>
						<Trash2 className="h-3.5 w-3.5" />
					</button>
				)}
			</span>
		</div>
	);
}
