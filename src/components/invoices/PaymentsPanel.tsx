"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useState, useTransition } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { Button, Card, Field, FormError, Input, Money, Select } from "@/components/ui";
import type { CompanySettings } from "@/lib/pdfSettings";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatRupiah } from "@/lib/utils";
import { PaymentReceiptDownloadButton } from "./PaymentReceiptDownloadButton";

type Payment = {
	id: string;
	payment_type: string;
	method: string | null;
	amount: number;
	paid_at: string;
	notes: string | null;
	verification_token: string;
};

export type LeafInvoice = {
	id: string;
	invoice_number: string;
	label: string | null;
	total_amount: number;
};

const PAYMENT_TYPES = ["down_payment", "partial", "final", "refund"];
const PAYMENT_METHODS = ["cash", "transfer"];

/**
 * Displays payment history and a "Record Payment" form.
 *
 * Payments are job-level (FK'd to jobs) but may carry an optional `invoice_id`
 * linking them to a specific termin invoice. Target resolution:
 *  - `invoiceId` set → fixed target (invoice-detail leaf view), no picker.
 *  - otherwise `leafInvoices` drives a smart target: 0 → job-level (invoice_id
 *    NULL, the pre-invoice DP); 1 → auto-target it; 2+ → an "Apply to" picker.
 * `totalAmount`/`payments` are whatever the caller passes (job-level on the job
 * page, per-invoice on the invoice page); the picker only sets the new payment's
 * `invoice_id`, it does not change the summary. `readOnly` hides the form (master
 * view). `invoiceStatus` may be `null`.
 */
export function PaymentsPanel({
	jobId,
	totalAmount,
	payments: initial,
	invoiceStatus,
	jobNumber,
	customerName,
	invoiceNumber,
	invoiceId,
	leafInvoices,
	readOnly = false,
	company,
	logoUrl,
	receiptTemplate,
}: {
	jobId: string;
	totalAmount: number;
	payments: Payment[];
	invoiceStatus: string | null;
	jobNumber: string;
	customerName: string;
	invoiceNumber?: string | null;
	/** Fixed target invoice (invoice-detail leaf view). Takes precedence over leafInvoices. */
	invoiceId?: string;
	/** Selectable targets (job page). Drives the smart-target picker. */
	leafInvoices?: LeafInvoice[];
	/** Hide the record-payment form (master view / rollup). */
	readOnly?: boolean;
	company: CompanySettings;
	/** Raw logo URL — forwarded to the receipt button for deferred base64 resolution. */
	logoUrl: string;
	receiptTemplate: { signatureName: string; signatureRole: string };
}) {
	const router = useRouter();
	const tPanel = useTranslations("panels.payments");
	const tForm = useTranslations("forms.payment");
	const tCommonButtons = useTranslations("common.buttons");
	const tCommonErrors = useTranslations("common.errors");
	const tPaymentType = useTranslations("entity.paymentType");
	const tPaymentMethod = useTranslations("entity.paymentMethod");
	const [isPending, startTransition] = useTransition();
	const [payments, setPayments] = useState(initial);
	const [showForm, setShowForm] = useState(false);
	const leaves = leafInvoices ?? [];
	// Smart target: fixed invoiceId wins; else auto-select the sole leaf; else the
	// first leaf when a picker is shown; else "" = job-level (invoice_id NULL).
	const initialTarget = invoiceId ?? (leaves.length >= 1 ? leaves[0].id : "");
	const [targetId, setTargetId] = useState<string>(initialTarget);
	const showPicker = !invoiceId && leaves.length >= 2;
	const soleLeaf = !invoiceId && leaves.length === 1 ? leaves[0] : null;
	const [form, setForm] = useState({
		payment_type: "down_payment",
		method: "transfer",
		amount: String(Math.round(totalAmount * 0.3)),
		paid_at: todayISO(),
		notes: "",
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const totalPaid = payments.reduce(
		(s, p) => s + (p.payment_type === "refund" ? -p.amount : p.amount),
		0,
	);
	const outstanding = totalAmount - totalPaid;
	const isFullyPaid = outstanding <= 0;

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const amt = Number(form.amount);
		if (!amt || amt <= 0) {
			setError(tCommonErrors("amountMustBePositive"));
			return;
		}
		setSaving(true);
		setError(null);

		try {
			const supabase = createClient();
			const { data, error: insertErr } = await supabase
				.from("payments")
				.insert({
					job_id: jobId,
					invoice_id: (invoiceId ?? targetId) || null,
					payment_type: form.payment_type as "down_payment" | "partial" | "final" | "refund",
					method: form.method as "cash" | "transfer",
					amount: amt,
					paid_at: form.paid_at,
					notes: form.notes.trim() || null,
				})
				.select("id, payment_type, method, amount, paid_at, notes, verification_token")
				.single();

			if (insertErr) throw insertErr;

			setPayments((p) => [...p, data as Payment]);
			setShowForm(false);
			setForm({
				payment_type: "down_payment",
				method: "transfer",
				amount: String(Math.round(totalAmount * 0.3)),
				paid_at: todayISO(),
				notes: "",
			});
			startTransition(() => router.refresh());
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Error");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-4">
			{/* Summary */}
			<div className="grid grid-cols-3 gap-2 text-center">
				<div className="rounded-xl bg-subtle px-1 py-3 min-w-0">
					<p className="text-xs text-ink-muted mb-1">{tPanel("total")}</p>
					<p className="tabular-nums font-bold text-xs text-ink leading-tight">
						{formatRupiah(totalAmount)}
					</p>
				</div>
				<div className="rounded-xl bg-success-bg px-1 py-3 min-w-0">
					<p className="text-xs text-ink-muted mb-1">{tPanel("paid")}</p>
					<Money value={totalPaid} tone="positive" className="font-bold text-xs leading-tight" />
				</div>
				<div
					className={`rounded-xl px-1 py-3 min-w-0 ${outstanding > 0 ? "bg-danger-bg" : "bg-subtle"}`}
				>
					<p className="text-xs text-ink-muted mb-1">{tPanel("outstanding")}</p>
					<Money
						value={outstanding > 0 ? outstanding : 0}
						tone={outstanding > 0 ? "danger" : "muted"}
						className="font-bold text-xs leading-tight"
					/>
				</div>
			</div>

			{/* Record payment button */}
			{!readOnly && !isFullyPaid && invoiceStatus !== "cancelled" && (
				<Button
					type="button"
					variant={showForm ? "secondary" : "primary"}
					size="md"
					onClick={() => setShowForm((v) => !v)}
					className="w-full"
				>
					{showForm ? tCommonButtons("cancel") : tPanel("recordPayment")}
				</Button>
			)}

			{/* Payment form */}
			{!readOnly && showForm && (
				<form
					onSubmit={handleSubmit}
					className="rounded-xl border border-line p-4 space-y-3"
					autoComplete="off"
				>
					{error && <FormError>{error}</FormError>}
					{/* Smart target: picker for 2+ leaves, read-only line for the sole leaf */}
					{showPicker && (
						<Field label={tPanel("applyTo")} htmlFor="pt-target">
							<Select id="pt-target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
								{leaves.map((l) => (
									<option key={l.id} value={l.id}>
										{l.label ? `${l.label} — ${l.invoice_number}` : l.invoice_number}
									</option>
								))}
								<option value="">{tPanel("jobLevel")}</option>
							</Select>
						</Field>
					)}
					{soleLeaf && (
						<p className="text-xs text-ink-muted">
							{tPanel("appliesTo", {
								target: soleLeaf.label
									? `${soleLeaf.label} — ${soleLeaf.invoice_number}`
									: soleLeaf.invoice_number,
							})}
						</p>
					)}
					<div className="grid grid-cols-2 gap-3">
						<Field label={tForm("type")} htmlFor="pt-type">
							<Select
								id="pt-type"
								value={form.payment_type}
								onChange={(e) => {
									const t = e.target.value;
									setForm((p) => ({
										...p,
										payment_type: t,
										amount: defaultAmountForType(t, totalAmount, outstanding),
									}));
								}}
							>
								{PAYMENT_TYPES.map((t) => (
									<option key={t} value={t}>
										{tPaymentType(t)}
									</option>
								))}
							</Select>
						</Field>
						<Field label={tForm("method")} htmlFor="pt-method">
							<Select
								id="pt-method"
								value={form.method}
								onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}
							>
								{PAYMENT_METHODS.map((m) => (
									<option key={m} value={m}>
										{tPaymentMethod(m)}
									</option>
								))}
							</Select>
						</Field>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<Field label={tForm("amountIdr")} htmlFor="pt-amount" required>
							<NumericInput
								id="pt-amount"
								required
								value={Number(form.amount) || 0}
								onChange={(v) => setForm((p) => ({ ...p, amount: v > 0 ? String(v) : "" }))}
								className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed"
							/>
						</Field>
						<Field label={tForm("date")} htmlFor="pt-date">
							<Input
								id="pt-date"
								type="date"
								value={form.paid_at}
								onChange={(e) => setForm((p) => ({ ...p, paid_at: e.target.value }))}
							/>
						</Field>
					</div>
					<Field label={tForm("notes")} htmlFor="pt-notes">
						<Input
							id="pt-notes"
							type="text"
							value={form.notes}
							onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
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
						{saving ? tCommonButtons("saving") : tForm("savePayment")}
					</Button>
				</form>
			)}

			{/* Payment history */}
			<Card className="divide-y divide-line">
				<p className="px-4 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">
					{tPanel("history")}
				</p>
				{payments.length === 0 && (
					<p className="px-4 py-4 text-sm text-center text-ink-faint">{tPanel("noPayments")}</p>
				)}
				{payments.map((p, idx) => (
					<div key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
						<div className="flex-1">
							<span className="font-medium text-ink">{tPaymentType(p.payment_type)}</span>
							<span className="text-xs text-ink-faint ml-2">
								{tPanel("via", {
									method: p.method ? tPaymentMethod(p.method) : "—",
								})}
							</span>
							{p.notes && <span className="block text-xs text-ink-faint">{p.notes}</span>}
							<span className="block text-xs text-ink-faint">{formatDate(p.paid_at)}</span>
						</div>
						<Money
							value={p.amount}
							tone={p.payment_type === "refund" ? "danger" : "positive"}
							className="font-medium"
						/>
						<PaymentReceiptDownloadButton
							receiptProps={{
								payment: p,
								receiptNumber: idx + 1,
								jobNumber,
								customerName,
								invoiceNumber,
								company,
								template: {
									...receiptTemplate,
									verificationQrUrl: "",
									verificationUrl: "",
								},
							}}
							verificationToken={p.verification_token}
							logoUrl={logoUrl}
						/>
					</div>
				))}
			</Card>
		</div>
	);
}

function todayISO() {
	return new Date().toLocaleDateString("en-CA");
}

function defaultAmountForType(type: string, total: number, outstanding: number): string {
	if (type === "down_payment") return String(Math.round(total * 0.3));
	if (type === "final") return String(Math.max(0, outstanding));
	return "";
}
