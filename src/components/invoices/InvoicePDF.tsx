"use client";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { CompanyHeader, DocFooter, SignatureSeal, StatusPill } from "@/components/pdf/PdfChrome";
import { PDF_COLOR, PDF_PAGE_PAD, type PdfTone, registerPdfFonts } from "@/lib/pdf/theme";
import {
	formatCustomerName,
	formatIndonesianDate,
	formatRupiah,
	numberToIndonesianWords,
} from "@/lib/utils";

registerPdfFonts();

/** Maps an invoice status → a status pill (label + tone). */
function statusPill(status: string): { label: string; tone: PdfTone } {
	switch (status) {
		case "paid":
			return { label: "Lunas", tone: "success" };
		case "partially_paid":
			return { label: "Dibayar Sebagian", tone: "warn" };
		case "overdue":
			return { label: "Jatuh Tempo", tone: "danger" };
		case "cancelled":
			return { label: "Dibatalkan", tone: "neutral" };
		default:
			return { label: "Belum Dibayar", tone: "danger" };
	}
}

// Scale-aware styles. `s` (fitScale) shrinks font sizes and vertical spacing so
// an over-long invoice can be compacted onto one page (see pdfFit.ts).
function makeStyles(s: number) {
	return StyleSheet.create({
		page: {
			fontFamily: "Inter",
			fontSize: 9.5 * s,
			color: PDF_COLOR.ink,
			paddingTop: 34 * s,
			paddingBottom: 46,
			paddingHorizontal: PDF_PAGE_PAD,
			// NOTE: never set `lineHeight` on the Page style — react-pdf then drops
			// the fixed absolutely-positioned footer. Set it per text block instead.
		},
		// ── Title + meta ────────────────────────────────────────────────────────
		titleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 * s },
		titleLeft: { flex: 1, paddingRight: 16 },
		title: {
			fontSize: 22 * s,
			lineHeight: 1.2,
			fontWeight: 700,
			color: PDF_COLOR.brand,
			letterSpacing: 0.5,
		},
		titleSub: { fontSize: 9.5 * s, color: PDF_COLOR.inkMuted, marginTop: 4 * s },
		metaCard: {
			width: 190,
			borderWidth: 0.75,
			borderColor: PDF_COLOR.line,
			borderRadius: 5,
			padding: 9 * s,
		},
		metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 * s },
		metaLabel: { fontSize: 8 * s, color: PDF_COLOR.inkMuted },
		metaValue: { fontSize: 8.5 * s, fontWeight: 600, color: PDF_COLOR.ink, textAlign: "right" },
		pillWrap: { marginTop: 4 * s, alignItems: "flex-end" },
		// ── Bill-to ─────────────────────────────────────────────────────────────
		billTo: { marginBottom: 12 * s },
		billLabel: {
			fontSize: 7.5 * s,
			fontWeight: 600,
			color: PDF_COLOR.inkFaint,
			letterSpacing: 0.6,
			textTransform: "uppercase",
			marginBottom: 3 * s,
		},
		billName: { fontSize: 11 * s, fontWeight: 600, color: PDF_COLOR.ink },
		billLine: { fontSize: 9 * s, color: PDF_COLOR.inkMuted, marginTop: 1 },
		// ── Table ───────────────────────────────────────────────────────────────
		table: { marginBottom: 12 * s },
		thead: {
			flexDirection: "row",
			backgroundColor: PDF_COLOR.brandTint,
			borderBottomWidth: 1,
			borderBottomColor: PDF_COLOR.brand,
			paddingVertical: 5 * s,
		},
		row: {
			flexDirection: "row",
			borderBottomWidth: 0.5,
			borderBottomColor: PDF_COLOR.line,
			paddingVertical: 7 * s,
		},
		th: {
			fontSize: 8 * s,
			fontWeight: 700,
			color: PDF_COLOR.brand,
			letterSpacing: 0.4,
			textTransform: "uppercase",
		},
		td: { fontSize: 9.5 * s, color: PDF_COLOR.ink },
		colNo: { width: 22, textAlign: "center", paddingHorizontal: 2 },
		colDesc: { flex: 1, paddingHorizontal: 6 },
		colQty: { width: 34, textAlign: "center", paddingHorizontal: 2 },
		colPrice: { width: 84, textAlign: "right", paddingHorizontal: 6 },
		colAmount: { width: 88, textAlign: "right", paddingHorizontal: 6 },
		// ── Footer section (bank + totals) ──────────────────────────────────────
		lower: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 * s },
		bankBox: {
			flex: 1,
			marginRight: 16,
			backgroundColor: PDF_COLOR.surfaceSunken,
			borderRadius: 5,
			padding: 10 * s,
		},
		bankHeading: {
			fontSize: 7.5 * s,
			fontWeight: 700,
			color: PDF_COLOR.inkMuted,
			letterSpacing: 0.5,
			textTransform: "uppercase",
			marginBottom: 4 * s,
		},
		bankRow: { flexDirection: "row", marginTop: 2 * s },
		bankKey: { width: 66, fontSize: 8.5 * s, color: PDF_COLOR.inkMuted },
		bankVal: { flex: 1, fontSize: 9 * s, fontWeight: 500, color: PDF_COLOR.ink },
		totals: { width: 205 },
		totalRow: {
			flexDirection: "row",
			justifyContent: "space-between",
			paddingVertical: 3 * s,
			paddingHorizontal: 2,
		},
		totalLabel: { fontSize: 9 * s, color: PDF_COLOR.inkMuted },
		totalValue: { fontSize: 9 * s, fontWeight: 500, color: PDF_COLOR.ink },
		paidValue: { fontSize: 9 * s, fontWeight: 500, color: PDF_COLOR.successText },
		grandBar: {
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "center",
			backgroundColor: PDF_COLOR.brand,
			borderRadius: 5,
			paddingVertical: 7 * s,
			paddingHorizontal: 10 * s,
			marginTop: 4 * s,
		},
		grandLabel: { fontSize: 9 * s, fontWeight: 600, color: PDF_COLOR.white },
		grandValue: { fontSize: 12 * s, fontWeight: 700, color: PDF_COLOR.white },
		terbilang: {
			fontSize: 8.5 * s,
			fontStyle: "italic",
			color: PDF_COLOR.inkMuted,
			marginBottom: 4 * s,
		},
	});
}

export interface InvoicePDFProps {
	invoice: {
		invoice_number: string;
		total_amount: number;
		notes: string | null;
		created_at: string;
		/** Termin label, e.g. "DP" / "Pelunasan" (optional). */
		label?: string | null;
		/** Master invoice number this termin belongs to (optional). */
		parentNumber?: string | null;
		/** Amount already collected against this invoice (optional). */
		paid_amount?: number | null;
		/** Due date (optional). */
		due_date?: string | null;
		/** Lifecycle status — drives the status pill (optional). */
		status?: string | null;
	};
	customer: {
		prefix: string | null;
		name: string;
		type: "individual" | "corporate";
		company_name: string | null;
		address: string | null;
	};
	lead: {
		pickups: string[];
		destinations: string[];
	};
	company: {
		name: string;
		tagline: string;
		address: string;
		phone: string;
		website: string;
		city: string;
		logo: string;
	};
	template: {
		bankName: string;
		bankAccountNumber: string;
		bankAccountHolder: string;
		signatureName: string;
		signatureRole: string;
		verificationQrUrl: string;
		verificationUrl: string;
	};
	/** Fit-to-one-page scale (1 = default). Set by the download button's fit loop. */
	fitScale?: number;
}

export function InvoicePDF({
	invoice,
	customer,
	lead,
	company,
	template,
	fitScale = 1,
}: InvoicePDFProps) {
	const styles = makeStyles(fitScale);

	// Build the line-item description
	const pickupText = lead.pickups.join(", ");
	const destinationText = lead.destinations
		.map((d, i) => (i === 0 ? d : `lalu ke ${d}`))
		.join(", ");
	const description =
		invoice.notes?.trim() ||
		(pickupText && destinationText
			? `Pindah barang dari ${pickupText} ke ${destinationText}`
			: pickupText
				? `Pindah barang dari ${pickupText}`
				: "Jasa pindah barang");

	const total = invoice.total_amount;
	const paid = Math.max(0, invoice.paid_amount ?? 0);
	const outstanding = Math.max(0, total - paid);
	const hasPaid = paid > 0 && paid < total;
	const derivedStatus =
		invoice.status ?? (paid >= total && total > 0 ? "paid" : paid > 0 ? "partially_paid" : "sent");
	const pill = statusPill(derivedStatus);
	const amountWords = `${numberToIndonesianWords(Math.round(total))} rupiah`;

	return (
		<Document title={invoice.invoice_number} author={company.name} subject="Invoice">
			<Page size="A4" style={styles.page}>
				<CompanyHeader company={company} scale={fitScale} />

				{/* Title + meta card */}
				<View style={styles.titleRow}>
					<View style={styles.titleLeft}>
						<Text style={styles.title}>INVOICE</Text>
						<Text style={styles.titleSub}>
							{invoice.label ? invoice.label : "Tagihan Jasa Pindah"}
							{invoice.parentNumber ? ` · Termin dari ${invoice.parentNumber}` : ""}
						</Text>
					</View>
					<View style={styles.metaCard}>
						<View style={styles.metaRow}>
							<Text style={styles.metaLabel}>No. Invoice</Text>
							<Text style={styles.metaValue}>{invoice.invoice_number}</Text>
						</View>
						<View style={styles.metaRow}>
							<Text style={styles.metaLabel}>Tanggal</Text>
							<Text style={styles.metaValue}>{formatIndonesianDate(invoice.created_at)}</Text>
						</View>
						{invoice.due_date ? (
							<View style={styles.metaRow}>
								<Text style={styles.metaLabel}>Jatuh Tempo</Text>
								<Text style={styles.metaValue}>{formatIndonesianDate(invoice.due_date)}</Text>
							</View>
						) : null}
						<View style={styles.pillWrap}>
							<StatusPill label={pill.label} tone={pill.tone} scale={fitScale} />
						</View>
					</View>
				</View>

				{/* Bill to */}
				<View style={styles.billTo}>
					<Text style={styles.billLabel}>Ditagihkan kepada</Text>
					<Text style={styles.billName}>{formatCustomerName(customer.prefix, customer.name)}</Text>
					{customer.type === "corporate" && customer.company_name ? (
						<Text style={styles.billLine}>{customer.company_name}</Text>
					) : null}
					{customer.address ? <Text style={styles.billLine}>{customer.address}</Text> : null}
				</View>

				{/* Line items */}
				<View style={styles.table}>
					<View style={styles.thead}>
						<Text style={[styles.th, styles.colNo]}>No</Text>
						<Text style={[styles.th, styles.colDesc]}>Deskripsi</Text>
						<Text style={[styles.th, styles.colQty]}>Qty</Text>
						<Text style={[styles.th, styles.colPrice]}>Harga</Text>
						<Text style={[styles.th, styles.colAmount]}>Jumlah</Text>
					</View>
					<View style={styles.row}>
						<Text style={[styles.td, styles.colNo]}>1</Text>
						<Text style={[styles.td, styles.colDesc]}>{description}</Text>
						<Text style={[styles.td, styles.colQty]}>1</Text>
						<Text style={[styles.td, styles.colPrice]}>{formatRupiah(total)}</Text>
						<Text style={[styles.td, styles.colAmount]}>{formatRupiah(total)}</Text>
					</View>
				</View>

				{/* Bank instructions + totals */}
				<View style={styles.lower}>
					<View style={styles.bankBox}>
						<Text style={styles.bankHeading}>Instruksi Pembayaran</Text>
						<View style={styles.bankRow}>
							<Text style={styles.bankKey}>Bank</Text>
							<Text style={styles.bankVal}>{template.bankName}</Text>
						</View>
						<View style={styles.bankRow}>
							<Text style={styles.bankKey}>No. Rekening</Text>
							<Text style={styles.bankVal}>{template.bankAccountNumber}</Text>
						</View>
						<View style={styles.bankRow}>
							<Text style={styles.bankKey}>Atas Nama</Text>
							<Text style={styles.bankVal}>{template.bankAccountHolder}</Text>
						</View>
					</View>
					<View style={styles.totals}>
						<View style={styles.totalRow}>
							<Text style={styles.totalLabel}>Subtotal</Text>
							<Text style={styles.totalValue}>{formatRupiah(total)}</Text>
						</View>
						{hasPaid ? (
							<View style={styles.totalRow}>
								<Text style={styles.totalLabel}>Sudah Dibayar</Text>
								<Text style={styles.paidValue}>− {formatRupiah(paid)}</Text>
							</View>
						) : null}
						<View style={styles.grandBar}>
							<Text style={styles.grandLabel}>{hasPaid ? "Sisa Tagihan" : "Total"}</Text>
							<Text style={styles.grandValue}>{formatRupiah(hasPaid ? outstanding : total)}</Text>
						</View>
					</View>
				</View>

				<Text style={styles.terbilang}>Terbilang: {amountWords}</Text>

				<SignatureSeal
					company={company}
					name={template.signatureName}
					role={template.signatureRole}
					qrUrl={template.verificationQrUrl}
					verifyUrl={template.verificationUrl}
					scale={fitScale}
				/>

				<DocFooter docNumber={invoice.invoice_number} website={company.website} scale={fitScale} />
			</Page>
		</Document>
	);
}

export function buildInvoiceFilename(invoiceNumber: string): string {
	return `${invoiceNumber.replace(/\//g, "-")}.pdf`;
}
