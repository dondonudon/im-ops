"use client";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { PendingLink } from "@/components/shared/PendingLink";
import { Badge, Button, Card, Field, FormError, Input, Money, toneFor } from "@/components/ui";
import { splitSumStatus } from "@/lib/invoices";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/utils";

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
	// Inline edit of an existing termin's amount/label — for post-issue discounts
	// or scope changes on an open termin. The DB `after_invoice_total_change`
	// trigger (migration 012) re-derives status, so lowering total to match a
	// payment flips the termin to 'paid'.
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState({ amount: "", label: "" });

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

	function openEdit(c: TerminChild) {
		setEditingId(c.id);
		setEditForm({ amount: String(c.total_amount), label: c.label ?? "" });
		setError(null);
	}

	async function handleSaveEdit(e: React.FormEvent) {
		e.preventDefault();
		if (!editingId) return;
		const child = termins.find((c) => c.id === editingId);
		const amount = Number(editForm.amount);
		if (!amount || amount <= 0) return;
		// Floor mirror of the DB guard (migration 013): never below cash collected.
		if (child && amount < child.paid_amount) {
			setError(t("belowPaid", { paid: formatRupiah(child.paid_amount) }));
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const supabase = createClient();
			const { error: updErr } = await supabase
				.from("invoices")
				.update({ total_amount: amount, label: editForm.label.trim() || null })
				.eq("id", editingId);
			if (updErr) throw updErr;
			// Audit trail: record the total change on the job timeline.
			const {
				data: { user },
			} = await supabase.auth.getUser();
			await supabase.from("job_timeline").insert({
				job_id: jobId,
				event_type: "invoice_total_edited",
				notes: `${child?.invoice_number ?? ""}: ${formatRupiah(child?.total_amount ?? 0)} → ${formatRupiah(amount)}`,
				logged_by: user?.id ?? null,
			});
			setEditingId(null);
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
					{termins.map((c) =>
						editingId === c.id ? (
							<form
								key={c.id}
								onSubmit={handleSaveEdit}
								className="px-4 py-3 space-y-3"
								autoComplete="off"
							>
								<Field label={t("labelField")} htmlFor={`edit-label-${c.id}`}>
									<Input
										id={`edit-label-${c.id}`}
										type="text"
										value={editForm.label}
										onChange={(e) => setEditForm((p) => ({ ...p, label: e.target.value }))}
										placeholder="DP / Pelunasan"
									/>
								</Field>
								<Field label={t("amount")} htmlFor={`edit-amount-${c.id}`} required>
									<NumericInput
										id={`edit-amount-${c.id}`}
										required
										value={Number(editForm.amount) || 0}
										onChange={(v) => setEditForm((p) => ({ ...p, amount: v > 0 ? String(v) : "" }))}
										className={CONTROL_CLASS}
									/>
								</Field>
								<div className="flex gap-2">
									<Button
										type="submit"
										variant="primary"
										size="sm"
										loading={saving}
										disabled={saving || isPending}
										className="flex-1"
									>
										{saving ? tCommonButtons("saving") : tCommonButtons("save")}
									</Button>
									<Button
										type="button"
										variant="secondary"
										size="sm"
										onClick={() => setEditingId(null)}
										disabled={saving || isPending}
									>
										{tCommonButtons("cancel")}
									</Button>
								</div>
							</form>
						) : (
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
								<div className="flex items-center gap-2 shrink-0">
									<div className="text-right">
										<Money value={c.total_amount} className="block font-medium" />
										<Money value={c.paid_amount} tone="positive" className="block text-xs" />
									</div>
									{c.status !== "cancelled" && (
										<button
											type="button"
											onClick={() => openEdit(c)}
											disabled={saving || isPending}
											aria-label={tCommonButtons("edit")}
											className="text-ink-faint hover:text-ink transition-colors disabled:opacity-60"
										>
											<Pencil size={14} aria-hidden="true" />
										</button>
									)}
								</div>
							</div>
						),
					)}
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
