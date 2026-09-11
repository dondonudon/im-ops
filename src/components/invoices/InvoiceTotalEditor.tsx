"use client";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { Button, FormError, Money } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

const CONTROL_CLASS =
	"w-40 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Inline editor for a top-level invoice's own `total_amount`, shown on the
 * invoice detail total row. Covers two cases the termin panel can't:
 *  - a master invoice grand total left stale by a later job adjustment (realign
 *    it to jobs.revenue so the "termin ≠ master" sum warning clears);
 *  - a standalone (un-split) invoice that needs a post-issue discount / scope
 *    change — there's no termin row to edit.
 * Write goes straight to PostgREST; the DB `after_invoice_total_change` trigger
 * (migration 012) re-derives status, so lowering total to match paid → 'paid'.
 */
export function InvoiceTotalEditor({
	invoiceId,
	total,
	editable,
}: {
	invoiceId: string;
	total: number;
	editable: boolean;
}) {
	const router = useRouter();
	const tCommonButtons = useTranslations("common.buttons");
	const [isPending, startTransition] = useTransition();
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [amount, setAmount] = useState(String(total));

	if (!editable) return <Money value={total} tone="positive" />;

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		const n = Number(amount);
		if (!n || n <= 0) return;
		setSaving(true);
		setError(null);
		try {
			const supabase = createClient();
			const { error: updErr } = await supabase
				.from("invoices")
				.update({ total_amount: n })
				.eq("id", invoiceId);
			if (updErr) throw updErr;
			setEditing(false);
			startTransition(() => router.refresh());
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Error");
		} finally {
			setSaving(false);
		}
	}

	if (editing) {
		return (
			<div className="flex flex-col items-end gap-1">
				<form onSubmit={handleSave} className="flex items-center gap-2" autoComplete="off">
					<NumericInput
						value={Number(amount) || 0}
						onChange={(v) => setAmount(v > 0 ? String(v) : "")}
						className={CONTROL_CLASS}
						required
					/>
					<Button
						type="submit"
						variant="primary"
						size="sm"
						loading={saving}
						disabled={saving || isPending}
					>
						{saving ? tCommonButtons("saving") : tCommonButtons("save")}
					</Button>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={() => {
							setEditing(false);
							setAmount(String(total));
							setError(null);
						}}
						disabled={saving || isPending}
					>
						{tCommonButtons("cancel")}
					</Button>
				</form>
				{error && <FormError>{error}</FormError>}
			</div>
		);
	}

	return (
		<span className="flex items-center gap-2">
			<Money value={total} tone="positive" />
			<button
				type="button"
				onClick={() => {
					setAmount(String(total));
					setEditing(true);
				}}
				disabled={isPending}
				aria-label={tCommonButtons("edit")}
				className="text-ink-faint hover:text-ink transition-colors disabled:opacity-60"
			>
				<Pencil size={14} aria-hidden="true" />
			</button>
		</span>
	);
}
