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
};

const PAYMENT_TYPES = ["down_payment", "partial", "final", "refund"];
const PAYMENT_METHODS = ["cash", "transfer"];

/**
 * Displays payment history and a "Record Payment" form.
 *
 * Payments are FK'd to jobs (not invoices) so a down payment can be taken
 * before an invoice is generated. `totalAmount` is the target the panel
 * compares against — usually the invoice total, or the job revenue if no
 * invoice exists yet. `invoiceStatus` may be `null` when there's no invoice.
 */
export function PaymentsPanel({
	jobId,
	totalAmount,
	payments: initial,
	invoiceStatus,
	jobNumber,
	customerName,
	invoiceNumber,
	company,
	receiptTemplate,
}: {
	jobId: string;
	totalAmount: number;
	payments: Payment[];
	invoiceStatus: string | null;
	jobNumber: string;
	customerName: string;
	invoiceNumber?: string | null;
	company: CompanySettings;
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
	const [form, setForm] = useState({
		payment_type: "down_payment",
		method: "transfer",
		amount: "",
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
					payment_type: form.payment_type as "down_payment" | "partial" | "final" | "refund",
					method: form.method as "cash" | "transfer",
					amount: amt,
					paid_at: form.paid_at,
					notes: form.notes.trim() || null,
				})
				.select("id, payment_type, method, amount, paid_at, notes")
				.single();

			if (insertErr) throw insertErr;

			setPayments((p) => [...p, data as Payment]);
			setShowForm(false);
			setForm({
				payment_type: "down_payment",
				method: "transfer",
				amount: "",
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
			<div className="grid grid-cols-3 gap-3 text-center">
				<div className="rounded-xl bg-subtle p-3">
					<p className="text-xs text-ink-muted mb-1">{tPanel("total")}</p>
					<p className="tabular-nums font-bold text-sm text-ink">{formatRupiah(totalAmount)}</p>
				</div>
				<div className="rounded-xl bg-success-bg p-3">
					<p className="text-xs text-ink-muted mb-1">{tPanel("paid")}</p>
					<Money value={totalPaid} tone="positive" className="font-bold text-sm" />
				</div>
				<div className={`rounded-xl p-3 ${outstanding > 0 ? "bg-danger-bg" : "bg-subtle"}`}>
					<p className="text-xs text-ink-muted mb-1">{tPanel("outstanding")}</p>
					<Money
						value={outstanding > 0 ? outstanding : 0}
						tone={outstanding > 0 ? "danger" : "muted"}
						className="font-bold text-sm"
					/>
				</div>
			</div>

			{/* Record payment button */}
			{!isFullyPaid && invoiceStatus !== "cancelled" && (
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
			{showForm && (
				<form onSubmit={handleSubmit} className="rounded-xl border border-line p-4 space-y-3">
					{error && <FormError>{error}</FormError>}
					<div className="grid grid-cols-2 gap-3">
						<Field label={tForm("type")} htmlFor="pt-type">
							<Select
								id="pt-type"
								value={form.payment_type}
								onChange={(e) => setForm((p) => ({ ...p, payment_type: e.target.value }))}
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
								template: receiptTemplate,
							}}
						/>
					</div>
				))}
			</Card>
		</div>
	);
}

function todayISO() {
	return new Date().toISOString().slice(0, 10);
}
