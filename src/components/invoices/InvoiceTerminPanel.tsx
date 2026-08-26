"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { PendingLink } from "@/components/shared/PendingLink";
import { Badge, Button, Card, Field, FormError, Input, Money, toneFor } from "@/components/ui";
import { splitSumStatus } from "@/lib/invoices";
import { createClient } from "@/lib/supabase/client";

export type TerminChild = {
	id: string;
	invoice_number: string;
	label: string | null;
	status: string;
	total_amount: number;
	paid_amount: number;
};

const CONTROL_CLASS =
	"w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Termin breakdown for a master invoice on the invoice detail page. Lists the
 * existing termin and lets the operator add more without leaving for the job
 * page — mirrors the "Add termin" flow in JobInvoicesPanel so splitting is
 * reachable right where invoice creation redirects.
 */
export function InvoiceTerminPanel({
	jobId,
	masterId,
	masterTotal,
	termins,
}: {
	jobId: string;
	masterId: string;
	masterTotal: number;
	termins: TerminChild[];
}) {
	const router = useRouter();
	const t = useTranslations("panels.jobInvoices");
	const tPage = useTranslations("pages.invoiceDetail");
	const tStatus = useTranslations("status.invoice");
	const tCommonButtons = useTranslations("common.buttons");
	const [isPending, startTransition] = useTransition();
	const [saving, setSaving] = useState(false);
	const [showForm, setShowForm] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState({ amount: "", label: "", due_date: "" });

	const sum = splitSumStatus(
		termins.map((c) => c.total_amount),
		masterTotal,
	);

	/**
	 * Prefill the termin form: first termin defaults to a 30% down payment ("DP"),
	 * any subsequent termin defaults to the remaining outstanding ("Pelunasan"), so
	 * children always sum to the master total.
	 */
	function openTerminForm() {
		const alreadySplit = termins.reduce((s, c) => s + c.total_amount, 0);
		const outstanding = Math.max(masterTotal - alreadySplit, 0);
		// Client component: browser runs in Jakarta time, so local date is correct.
		const due = new Date();
		due.setDate(due.getDate() + 7);
		const dueDate = due.toLocaleDateString("en-CA");
		if (termins.length === 0) {
			setForm({ amount: String(Math.round(masterTotal * 0.3)), label: "DP", due_date: dueDate });
		} else {
			setForm({ amount: String(outstanding), label: "Pelunasan", due_date: dueDate });
		}
		setShowForm(true);
	}

	async function handleAddTermin(e: React.FormEvent) {
		e.preventDefault();
		const amount = Number(form.amount);
		if (!amount || amount <= 0) return;
		setSaving(true);
		setError(null);
		try {
			const supabase = createClient();
			const { data: invoiceNumber, error: rpcErr } = await supabase.rpc("generate_invoice_number");
			if (rpcErr) throw rpcErr;
			const { error: insertErr } = await supabase.from("invoices").insert({
				job_id: jobId,
				invoice_number: invoiceNumber as string,
				total_amount: amount,
				paid_amount: 0,
				status: "sent",
				parent_invoice_id: masterId,
				label: form.label.trim() || null,
				due_date: form.due_date || null,
			});
			if (insertErr) throw insertErr;
			setShowForm(false);
			setForm({ amount: "", label: "", due_date: "" });
			startTransition(() => router.refresh());
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Error");
		} finally {
			setSaving(false);
		}
	}

	return (
		<Card className="p-4 space-y-3">
			<p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
				{tPage("terminBreakdown")}
			</p>
			{error && <FormError>{error}</FormError>}

			{termins.length > 0 && (
				<div className="divide-y divide-line -mx-4">
					{termins.map((c) => (
						<div key={c.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-xs text-ink-muted">{c.label ?? "—"}</span>
									<Badge tone={toneFor("invoice", c.status)}>{tStatus(c.status as never)}</Badge>
								</div>
								<PendingLink
									href={`/invoices/${c.id}`}
									className="font-mono text-xs text-primary-text hover:underline"
								>
									{c.invoice_number}
								</PendingLink>
							</div>
							<div className="text-right shrink-0">
								<Money value={c.total_amount} className="block font-medium" />
								<Money value={c.paid_amount} tone="positive" className="block text-xs" />
							</div>
						</div>
					))}
				</div>
			)}

			{termins.length > 0 && sum !== "ok" && (
				<Badge tone="pending">
					{t("sumWarning", {
						sum: formatShort(termins.reduce((s, c) => s + c.total_amount, 0)),
						total: formatShort(masterTotal),
					})}
				</Badge>
			)}

			{showForm ? (
				<form
					onSubmit={handleAddTermin}
					className="rounded-xl border border-line p-4 space-y-3"
					autoComplete="off"
				>
					<Field label={t("labelField")} htmlFor="termin-label">
						<Input
							id="termin-label"
							type="text"
							value={form.label}
							onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
							placeholder="DP / Pelunasan"
						/>
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("amount")} htmlFor="termin-amount" required>
							<NumericInput
								id="termin-amount"
								required
								value={Number(form.amount) || 0}
								onChange={(v) => setForm((p) => ({ ...p, amount: v > 0 ? String(v) : "" }))}
								className={CONTROL_CLASS}
							/>
						</Field>
						<Field label={t("dueDate")} htmlFor="termin-due">
							<Input
								id="termin-due"
								type="date"
								value={form.due_date}
								onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
							/>
						</Field>
					</div>
					<Button
						type="submit"
						variant="primary"
						size="md"
						loading={saving}
						disabled={saving || isPending}
						className="w-full"
					>
						{saving ? tCommonButtons("saving") : t("addTermin")}
					</Button>
				</form>
			) : (
				<Button
					type="button"
					variant="secondary"
					size="md"
					onClick={openTerminForm}
					disabled={saving || isPending}
					className="w-full"
				>
					{t("addTermin")}
				</Button>
			)}
		</Card>
	);
}

function formatShort(v: number): string {
	return new Intl.NumberFormat("id-ID").format(v);
}
