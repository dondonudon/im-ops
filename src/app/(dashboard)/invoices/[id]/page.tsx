import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AttachablePayments } from "@/components/invoices/AttachablePayments";
import { InvoicePDFDownloadButton } from "@/components/invoices/InvoicePDFDownloadButton";
import { PaymentsPanel } from "@/components/invoices/PaymentsPanel";
import { BackLink } from "@/components/shared/BackLink";
import { PendingLink } from "@/components/shared/PendingLink";
import { Badge, Card, Money, PageHeader, toneFor } from "@/components/ui";
import { buildCompanySettings, buildInvoiceTemplateSettings } from "@/lib/pdfSettings";
import { createClient } from "@/lib/supabase/server";
import { formatCustomerName, formatDate } from "@/lib/utils";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.invoiceDetail");
	const tStatus = await getTranslations("status.invoice");

	const [{ data: invoice }, { data: settingsRows }] = await Promise.all([
		supabase
			.from("invoices")
			.select(`
        *,
        jobs(
          id, job_number, move_date,
          proposals(leads(id, pickup_address, destination_address, destination_address_2, customers(id, prefix, name, phone, email, type, company_name, address)))
        )
      `)
			.eq("id", id)
			.single(),
		supabase
			.from("system_settings")
			.select("key, value")
			.in("key", [
				"company_name",
				"company_tagline",
				"company_logo_url",
				"company_address",
				"company_phone",
				"company_website",
				"company_city",
				"invoice_bank_name",
				"invoice_bank_account_number",
				"invoice_bank_account_holder",
				"invoice_signature_name",
				"invoice_signature_role",
			]),
	]);

	if (!invoice) notFound();

	// Children (termin) of this invoice, this invoice's own payments, and any
	// job-level payments not yet attached to a termin (reassignment candidates).
	const [
		{ data: children },
		{ data: ownPayments },
		{ data: unassignedPayments },
		{ data: parent },
	] = await Promise.all([
		supabase
			.from("invoices")
			.select("id, invoice_number, label, status, total_amount, paid_amount, due_date")
			.eq("parent_invoice_id", id)
			.order("created_at", { ascending: true }),
		supabase
			.from("payments")
			.select("id, payment_type, method, amount, paid_at, notes, verification_token")
			.eq("invoice_id", id)
			.order("paid_at"),
		supabase
			.from("payments")
			.select("id, payment_type, method, amount, paid_at, notes, verification_token")
			.eq("job_id", invoice.job_id)
			.is("invoice_id", null)
			.order("paid_at"),
		invoice.parent_invoice_id
			? supabase
					.from("invoices")
					.select("invoice_number")
					.eq("id", invoice.parent_invoice_id)
					.maybeSingle()
			: Promise.resolve({ data: null }),
	]);

	const isMaster = (children ?? []).length > 0;
	const parentNumber = (parent as { invoice_number: string } | null)?.invoice_number ?? null;

	const settingsMap = Object.fromEntries((settingsRows ?? []).map((s) => [s.key, s.value]));
	const pdfCompany = buildCompanySettings(settingsMap);
	const pdfTemplate = buildInvoiceTemplateSettings(settingsMap);

	type PaymentRow = {
		id: string;
		payment_type: string;
		method: string;
		amount: number;
		paid_at: string;
		notes: string | null;
		verification_token: string;
	};

	const job = invoice.jobs as {
		id: string;
		job_number: string;
		move_date: string | null;
		proposals: {
			leads: {
				id: string;
				pickup_address: string | null;
				destination_address: string | null;
				destination_address_2: string | null;
				customers: {
					id: string;
					prefix: string | null;
					name: string;
					phone: string | null;
					email: string | null;
					type: "individual" | "corporate";
					company_name: string | null;
					address: string | null;
				} | null;
			} | null;
		} | null;
	} | null;

	const payments: PaymentRow[] = ((ownPayments ?? []) as PaymentRow[]).filter(
		(p) => p.paid_at != null,
	);

	const lead = job?.proposals?.leads ?? null;
	const customer = lead?.customers ?? null;

	return (
		<div className="space-y-6">
			<BackLink href="/invoices" label={t("backToList")} />
			{/* Header */}
			<PageHeader
				title={
					<span className="flex items-center gap-3">
						<span className="font-mono">{invoice.invoice_number}</span>
						{invoice.label && <span className="text-ink-muted text-sm">{invoice.label}</span>}
						<Badge tone={toneFor("invoice", invoice.status)} dot>
							{tStatus(invoice.status as never)}
						</Badge>
					</span>
				}
				subtitle={
					<>
						{customer ? formatCustomerName(customer.prefix, customer.name) : "—"}
						{invoice.due_date && ` · ${t("due", { date: formatDate(invoice.due_date) })}`}
						{job && (
							<>
								{" "}
								·{" "}
								<PendingLink href={`/jobs/${job.id}`} className="text-primary-text hover:underline">
									{job.job_number}
								</PendingLink>
							</>
						)}
					</>
				}
				actions={
					customer && job ? (
						<InvoicePDFDownloadButton
							logoUrl={settingsMap.company_logo_url ?? ""}
							verificationToken={invoice.verification_token}
							pdfProps={{
								invoice: {
									invoice_number: invoice.invoice_number,
									total_amount: invoice.total_amount,
									notes: invoice.notes ?? null,
									created_at: invoice.created_at,
									label: invoice.label ?? null,
									parentNumber,
								},
								customer: {
									prefix: customer.prefix,
									name: customer.name,
									type: customer.type,
									company_name: customer.company_name,
									address: customer.address,
								},
								lead: {
									pickup_address: lead?.pickup_address ?? null,
									destination_address: lead?.destination_address ?? null,
									destination_address_2: lead?.destination_address_2 ?? null,
								},
								company: pdfCompany,
								template: pdfTemplate,
							}}
						/>
					) : undefined
				}
			/>

			<div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
				<div className="xl:col-span-2 space-y-6">
					<Card className="p-5 text-sm space-y-3">
						{customer && (
							<>
								<div className="flex gap-4">
									<span className="w-32 text-ink-muted">{t("customer")}</span>
									<span className="font-medium text-ink">
										{formatCustomerName(customer.prefix, customer.name)}
									</span>
								</div>
								{customer.phone && (
									<div className="flex gap-4">
										<span className="w-32 text-ink-muted">{t("phone")}</span>
										<span className="text-ink">{customer.phone}</span>
									</div>
								)}
								{customer.email && (
									<div className="flex gap-4">
										<span className="w-32 text-ink-muted">{t("email")}</span>
										<span className="text-ink">{customer.email}</span>
									</div>
								)}
							</>
						)}
						{job?.move_date && (
							<div className="flex gap-4">
								<span className="w-32 text-ink-muted">{t("moveDate")}</span>
								<span className="text-ink">{formatDate(job.move_date)}</span>
							</div>
						)}
						<div className="flex gap-4">
							<span className="w-32 text-ink-muted">{t("invoiceDate")}</span>
							<span className="text-ink">{formatDate(invoice.created_at)}</span>
						</div>
						{invoice.due_date && (
							<div className="flex gap-4">
								<span className="w-32 text-ink-muted">{t("dueDate")}</span>
								<span className="text-ink">{formatDate(invoice.due_date)}</span>
							</div>
						)}
						{invoice.notes && (
							<div className="flex gap-4">
								<span className="w-32 text-ink-muted">{t("notes")}</span>
								<span className="whitespace-pre-line text-ink">{invoice.notes}</span>
							</div>
						)}
						<div className="pt-2 border-t border-line flex justify-between font-bold text-base">
							<span className="text-ink">{t("total")}</span>
							<Money value={invoice.total_amount} tone="positive" />
						</div>
					</Card>
				</div>

				{/* Right: termin breakdown (master) or payments (leaf) */}
				<div className="xl:col-span-1 space-y-4">
					{isMaster && (
						<Card className="divide-y divide-line">
							<p className="px-4 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">
								{t("terminBreakdown")}
							</p>
							{(children ?? []).map((c) => (
								<div
									key={c.id}
									className="flex items-center justify-between gap-2 px-4 py-3 text-sm"
								>
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="text-xs text-ink-muted">{c.label ?? "—"}</span>
											<Badge tone={toneFor("invoice", c.status)}>
												{tStatus(c.status as never)}
											</Badge>
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
						</Card>
					)}
					<PaymentsPanel
						jobId={invoice.job_id}
						totalAmount={invoice.total_amount}
						payments={payments ?? []}
						invoiceStatus={invoice.status}
						invoiceId={isMaster ? undefined : invoice.id}
						readOnly={isMaster}
						jobNumber={job?.job_number ?? ""}
						customerName={customer ? formatCustomerName(customer.prefix, customer.name) : ""}
						invoiceNumber={invoice.invoice_number}
						company={pdfCompany}
						logoUrl={settingsMap.company_logo_url ?? ""}
						receiptTemplate={{
							signatureName: pdfTemplate.signatureName,
							signatureRole: pdfTemplate.signatureRole,
						}}
					/>
					{!isMaster && (unassignedPayments ?? []).length > 0 && (
						<AttachablePayments
							jobId={invoice.job_id}
							invoiceId={invoice.id}
							payments={(unassignedPayments ?? []) as never}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
