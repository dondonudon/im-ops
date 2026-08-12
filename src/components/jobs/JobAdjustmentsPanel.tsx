"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { Button, Card, Field, FormError, Input, Money, Select } from "@/components/ui";
import { deriveJobRevenue } from "@/lib/invoices";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatRupiah, todayInJakarta } from "@/lib/utils";

export type Adjustment = {
	id: string;
	amount: number;
	reason: string;
	adjusted_at: string;
};

const CONTROL_CLASS =
	"w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * "Charges & adjustments" panel. jobs.revenue is derived (base_revenue + Σ
 * adjustments) by a DB trigger, so recording/deleting an adjustment here just
 * writes the job_adjustments row and refreshes — the trigger recomputes revenue.
 * Amounts are signed: a "charge" is positive, a "discount" negative.
 */
export function JobAdjustmentsPanel({
	jobId,
	baseRevenue,
	adjustments: initial,
}: {
	jobId: string;
	baseRevenue: number;
	adjustments: Adjustment[];
}) {
	const router = useRouter();
	const t = useTranslations("panels.adjustments");
	const tCommonButtons = useTranslations("common.buttons");
	const tCommonErrors = useTranslations("common.errors");
	const [isPending, startTransition] = useTransition();
	const [adjustments, setAdjustments] = useState(initial);
	const [showForm, setShowForm] = useState(false);
	const [form, setForm] = useState({ kind: "charge", amount: "", reason: "" });
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const derivedTotal = deriveJobRevenue(baseRevenue, adjustments);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const magnitude = Number(form.amount);
		if (!magnitude || magnitude <= 0) {
			setError(tCommonErrors("amountMustBePositive"));
			return;
		}
		if (!form.reason.trim()) return; // reason input is `required`; browser blocks empty submit
		const amount = form.kind === "discount" ? -magnitude : magnitude;
		setSaving(true);
		setError(null);
		try {
			const supabase = createClient();
			const {
				data: { user },
			} = await supabase.auth.getUser();
			const { data, error: insertErr } = await supabase
				.from("job_adjustments")
				.insert({
					job_id: jobId,
					amount,
					reason: form.reason.trim(),
					adjusted_at: todayInJakarta(),
					created_by: user?.id ?? null,
				})
				.select("id, amount, reason, adjusted_at")
				.single();
			if (insertErr) throw insertErr;

			await supabase.from("job_timeline").insert({
				job_id: jobId,
				event_type: "revenue_adjusted",
				notes: `${amount > 0 ? "+" : ""}${formatRupiah(amount)}: ${form.reason.trim()}`,
				logged_by: user?.id ?? null,
			});

			setAdjustments((prev) => [...prev, data as Adjustment]);
			setShowForm(false);
			setForm({ kind: "charge", amount: "", reason: "" });
			startTransition(() => router.refresh());
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Error");
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete(adjId: string) {
		const supabase = createClient();
		const { error: delErr } = await supabase.from("job_adjustments").delete().eq("id", adjId);
		if (delErr) {
			setError(delErr.message);
			return;
		}
		setAdjustments((prev) => prev.filter((a) => a.id !== adjId));
		startTransition(() => router.refresh());
	}

	return (
		<Card className="p-5 space-y-3">
			<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t("title")}</h2>

			<div className="text-xs text-ink-muted space-y-1">
				<div className="flex justify-between">
					<span>{t("contractedAmount")}</span>
					<span className="tabular-nums">{formatRupiah(baseRevenue)}</span>
				</div>
				{adjustments.map((a) => (
					<div key={a.id} className="flex items-center justify-between gap-2 group">
						<span className="truncate mr-2">
							{a.reason}
							<span className="text-ink-faint ml-1">{formatDate(a.adjusted_at)}</span>
						</span>
						<span className="flex items-center gap-1 shrink-0">
							<Money
								value={a.amount}
								tone={a.amount >= 0 ? "default" : "danger"}
								className="text-xs"
							/>
							<button
								type="button"
								onClick={() => handleDelete(a.id)}
								disabled={isPending}
								aria-label={tCommonButtons("delete")}
								className="text-ink-faint hover:text-danger transition-colors"
							>
								<Trash2 size={13} aria-hidden="true" />
							</button>
						</span>
					</div>
				))}
				<div className="flex justify-between font-medium border-t border-line pt-1 mt-1 text-ink">
					<span>{t("currentTotal")}</span>
					<span className="tabular-nums">{formatRupiah(derivedTotal)}</span>
				</div>
			</div>

			<Button
				type="button"
				variant={showForm ? "secondary" : "primary"}
				size="md"
				onClick={() => setShowForm((v) => !v)}
				className="w-full"
			>
				{showForm ? tCommonButtons("cancel") : t("add")}
			</Button>

			{showForm && (
				<form
					onSubmit={handleSubmit}
					className="rounded-xl border border-line p-4 space-y-3"
					autoComplete="off"
				>
					{error && <FormError>{error}</FormError>}
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("kind")} htmlFor="adj-kind">
							<Select
								id="adj-kind"
								value={form.kind}
								onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value }))}
							>
								<option value="charge">{t("charge")}</option>
								<option value="discount">{t("discount")}</option>
							</Select>
						</Field>
						<Field label={t("amount")} htmlFor="adj-amount" required>
							<NumericInput
								id="adj-amount"
								required
								value={Number(form.amount) || 0}
								onChange={(v) => setForm((p) => ({ ...p, amount: v > 0 ? String(v) : "" }))}
								className={CONTROL_CLASS}
							/>
						</Field>
					</div>
					<Field label={t("reason")} htmlFor="adj-reason" required>
						<Input
							id="adj-reason"
							type="text"
							required
							value={form.reason}
							onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
						/>
					</Field>
					<Button
						type="submit"
						variant="primary"
						size="md"
						disabled={saving || isPending}
						loading={saving}
						className="w-full"
					>
						{saving ? tCommonButtons("saving") : tCommonButtons("save")}
					</Button>
				</form>
			)}
		</Card>
	);
}
