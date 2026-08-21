"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { Badge, Button, Card, Field, FormError, Input, Money, toneFor } from "@/components/ui";
import { splitSumStatus } from "@/lib/invoices";
import { createClient } from "@/lib/supabase/client";

export type InvoiceRow = {
	id: string;
	invoice_number: string;
	label: string | null;
	status: string;
	total_amount: number;
	paid_amount: number;
	parent_invoice_id: string | null;
	due_date: string | null;
};

const CONTROL_CLASS =
	"w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Job invoices card: one grand-total (master) invoice per job plus N termin
 * (children). "Create grand-total invoice" makes the master; "Add termin" adds
 * a child under it. Payments are recorded per-invoice on the invoice detail page
 * (or via the job-level payments panel). Warns — but allows — when Σ children
 * totals ≠ the master total.
 */
export function JobInvoicesPanel({
	jobId,
	jobRevenue,
	invoices,
}: {
	jobId: string;
	jobRevenue: number;
	invoices: InvoiceRow[];
}) {
	const router = useRouter();
	const t = useTranslations("panels.jobInvoices");
	const tStatus = useTranslations("status.invoice");
	const tCommonButtons = useTranslations("common.buttons");
	const [isPending, startTransition] = useTransition();
	const [saving, setSaving] = useState(false);
	const [showForm, setShowForm] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState({ amount: "", label: "", due_date: "" });

	const master = invoices.find((i) => i.parent_invoice_id === null && i.status !== "cancelled");
	const children = master ? invoices.filter((i) => i.parent_invoice_id === master.id) : [];
	const sum = splitSumStatus(
		children.map((c) => c.total_amount),
		master?.total_amount ?? 0,
	);

	async function createInvoice(fields: {
		total_amount: number;
		parent_invoice_id: string | null;
		label: string | null;
		due_date: string | null;
	}) {
		setSaving(true);
		setError(null);
		try {
			const supabase = createClient();
			const { data: invoiceNumber, error: rpcErr } = await supabase.rpc("generate_invoice_number");
			if (rpcErr) throw rpcErr;
			const { data, error: insertErr } = await supabase
				.from("invoices")
				.insert({
					job_id: jobId,
					invoice_number: invoiceNumber as string,
					total_amount: fields.total_amount,
					paid_amount: 0,
					status: "sent",
					parent_invoice_id: fields.parent_invoice_id,
					label: fields.label,
					due_date: fields.due_date,
				})
				.select("id")
				.single();
			if (insertErr) throw insertErr;
			return data.id as string;
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Error");
			return null;
		} finally {
			setSaving(false);
		}
	}

	async function handleCreateMaster() {
		const id = await createInvoice({
			total_amount: jobRevenue,
			parent_invoice_id: null,
			label: null,
			due_date: null,
		});
		if (id) router.push(`/invoices/${id}`);
	}

	/**
	 * Prefill the termin form with sensible defaults: the first termin is a 30%
	 * down payment ("DP"); any subsequent termin defaults to the remaining
	 * outstanding value ("Pelunasan"), so the children always sum to the master.
	 */
	function openTerminForm() {
		const total = master?.total_amount ?? 0;
		const alreadySplit = children.reduce((s, c) => s + c.total_amount, 0);
		const outstanding = Math.max(total - alreadySplit, 0);
		// Client component: browser runs in Jakarta time, so local date is correct.
		const due = new Date();
		due.setDate(due.getDate() + 7);
		const dueDate = due.toLocaleDateString("en-CA");
		if (children.length === 0) {
			setForm({ amount: String(Math.round(total * 0.3)), label: "DP", due_date: dueDate });
		} else {
			setForm({ amount: String(outstanding), label: "Pelunasan", due_date: dueDate });
		}
		setShowForm(true);
	}

	async function handleAddTermin(e: React.FormEvent) {
		e.preventDefault();
		if (!master) return;
		const amount = Number(form.amount);
		if (!amount || amount <= 0) return;
		const id = await createInvoice({
			total_amount: amount,
			parent_invoice_id: master.id,
			label: form.label.trim() || null,
			due_date: form.due_date || null,
		});
		if (id) {
			setShowForm(false);
			setForm({ amount: "", label: "", due_date: "" });
			startTransition(() => router.refresh());
		}
	}

	return (
		<Card className="p-5 space-y-3">
			<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t("title")}</h2>
			{error && <FormError>{error}</FormError>}

			{!master ? (
				<Button
					type="button"
					variant="primary"
					size="md"
					onClick={handleCreateMaster}
					loading={saving}
					disabled={saving || isPending}
					className="w-full"
				>
					{t("createMaster")}
				</Button>
			) : (
				<div className="space-y-3 text-sm">
					{/* Master */}
					<InvoiceLine invoice={master} badge={t("master")} tStatus={tStatus} />

					{/* Children */}
					{children.length > 0 && (
						<div className="space-y-2 border-l-2 border-line pl-3">
							{children.map((c) => (
								<InvoiceLine
									key={c.id}
									invoice={c}
									badge={c.label ?? t("termin")}
									tStatus={tStatus}
								/>
							))}
						</div>
					)}

					{/* Split-sum warning */}
					{children.length > 0 && sum !== "ok" && (
						<Badge tone="pending">
							{t("sumWarning", {
								sum: formatShort(children.reduce((s, c) => s + c.total_amount, 0)),
								total: formatShort(master.total_amount),
							})}
						</Badge>
					)}

					{/* Add termin */}
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
							className="w-full"
						>
							{t("addTermin")}
						</Button>
					)}
				</div>
			)}
		</Card>
	);
}

function InvoiceLine({
	invoice,
	badge,
	tStatus,
}: {
	invoice: InvoiceRow;
	badge: string;
	tStatus: (key: string) => string;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-xs text-ink-muted">{badge}</span>
					<Badge tone={toneFor("invoice", invoice.status)}>{tStatus(invoice.status)}</Badge>
				</div>
				<Link
					href={`/invoices/${invoice.id}`}
					className="font-mono text-xs text-primary-text hover:underline"
				>
					{invoice.invoice_number}
				</Link>
			</div>
			<div className="text-right shrink-0">
				<Money value={invoice.total_amount} className="block font-medium text-sm" />
				<Money value={invoice.paid_amount} tone="positive" className="block text-xs" />
			</div>
		</div>
	);
}

function formatShort(v: number): string {
	return new Intl.NumberFormat("id-ID").format(v);
}
