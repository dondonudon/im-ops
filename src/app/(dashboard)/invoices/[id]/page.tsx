import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InvoicePDFDownloadButton } from "@/components/invoices/InvoicePDFDownloadButton";
import { PaymentsPanel } from "@/components/invoices/PaymentsPanel";
import { BackLink } from "@/components/shared/BackLink";
import { Badge, Card, Money, PageHeader, toneFor } from "@/components/ui";
import { buildCompanySettings, buildInvoiceTemplateSettings } from "@/lib/pdfSettings";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

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
          proposals(leads(id, pickup_address, destination_address, customers(id, name, phone, email, type, company_name, address))),
          payments(id, payment_type, method, amount, paid_at, notes)
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
	};

	const job = invoice.jobs as {
		id: string;
		job_number: string;
		move_date: string | null;
		payments: PaymentRow[];
		proposals: {
			leads: {
				id: string;
				pickup_address: string | null;
				destination_address: string | null;
				customers: {
					id: string;
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

	const payments: PaymentRow[] = (job?.payments ?? [])
		.filter((p): p is PaymentRow => p.paid_at != null)
		.sort((a, b) => a.paid_at.localeCompare(b.paid_at));

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
						<Badge tone={toneFor("invoice", invoice.status)} dot>
							{tStatus(invoice.status as never)}
						</Badge>
					</span>
				}
				subtitle={
					<>
						{customer?.name ?? "—"}
						{invoice.due_date && ` · ${t("due", { date: formatDate(invoice.due_date) })}`}
						{job && (
							<>
								{" "}
								·{" "}
								<Link href={`/jobs/${job.id}`} className="text-primary-text hover:underline">
									{job.job_number}
								</Link>
							</>
						)}
					</>
				}
				actions={
					customer && job ? (
						<InvoicePDFDownloadButton
							pdfProps={{
								invoice: {
									invoice_number: invoice.invoice_number,
									total_amount: invoice.total_amount,
									notes: invoice.notes ?? null,
									created_at: invoice.created_at,
								},
								customer: {
									name: customer.name,
									type: customer.type,
									company_name: customer.company_name,
									address: customer.address,
								},
								lead: {
									pickup_address: lead?.pickup_address ?? null,
									destination_address: lead?.destination_address ?? null,
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
									<span className="font-medium text-ink">{customer.name}</span>
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

				{/* Right: payments */}
				<div className="xl:col-span-1">
					<PaymentsPanel
						jobId={invoice.job_id}
						totalAmount={invoice.total_amount}
						payments={payments ?? []}
						invoiceStatus={invoice.status}
						jobNumber={job?.job_number ?? ""}
						customerName={customer?.name ?? ""}
						invoiceNumber={invoice.invoice_number}
						company={pdfCompany}
						receiptTemplate={{
							signatureName: pdfTemplate.signatureName,
							signatureRole: pdfTemplate.signatureRole,
						}}
					/>
				</div>
			</div>
		</div>
	);
}
