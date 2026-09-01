"use client";
import {
	Document,
	Font,
	Link,
	Page,
	Image as PdfImage,
	StyleSheet,
	Text,
	View,
} from "@react-pdf/renderer";
import { formatCustomerName, formatIndonesianDate, formatRupiahLetter } from "@/lib/utils";

Font.registerHyphenationCallback((word) => [word]);

// Scale-aware styles. `s` (fitScale) shrinks font sizes and vertical spacing so
// an over-long invoice can be compacted back onto one page (see pdfFit.ts).
// Horizontal metrics, borders and the fixed footer chrome stay constant.
function makeStyles(s: number) {
	return StyleSheet.create({
		page: {
			fontSize: 11 * s,
			fontFamily: "Helvetica",
			paddingTop: 28 * s,
			paddingBottom: 36,
			paddingHorizontal: 56,
			color: "#1f2937",
		},
		// ── Header ──────────────────────────────────────────────────────────────
		header: { alignItems: "center", marginBottom: 6 * s },
		logo: { width: 72 * s, height: 72 * s, marginBottom: 4 * s, objectFit: "contain" },
		tagline: {
			fontSize: 8 * s,
			textAlign: "center",
			color: "#374151",
			marginTop: 2,
			letterSpacing: 0.2,
		},
		headerAddress: { fontSize: 8 * s, textAlign: "center", color: "#374151", marginTop: 1 },
		divider: {
			borderBottomWidth: 0.5,
			borderBottomColor: "#374151",
			marginBottom: 10 * s,
			marginTop: 6 * s,
		},
		// ── Invoice title ────────────────────────────────────────────────────────
		invoiceTitleBlock: { alignItems: "center", marginBottom: 12 * s },
		invoiceTitle: {
			fontSize: 13 * s,
			fontFamily: "Helvetica-Bold",
			textDecoration: "underline",
			textAlign: "center",
		},
		invoiceNumber: { fontSize: 11 * s, textAlign: "center", marginTop: 3 * s },
		// ── Meta ────────────────────────────────────────────────────────────────
		date: { fontSize: 11 * s, marginBottom: 12 * s },
		recipient: { marginBottom: 12 * s },
		recipientLabel: { fontSize: 11 * s, marginBottom: 2 * s },
		recipientName: { fontSize: 11 * s, fontFamily: "Helvetica-Bold" },
		// ── Table ────────────────────────────────────────────────────────────────
		table: { marginBottom: 12 * s },
		tableHeaderRow: {
			flexDirection: "row",
			borderTopWidth: 0.5,
			borderBottomWidth: 0.5,
			borderLeftWidth: 0.5,
			borderRightWidth: 0.5,
			borderColor: "#374151",
		},
		tableRow: {
			flexDirection: "row",
			borderBottomWidth: 0.5,
			borderLeftWidth: 0.5,
			borderRightWidth: 0.5,
			borderColor: "#374151",
		},
		tableTotalRow: {
			flexDirection: "row",
			borderBottomWidth: 0.5,
			borderLeftWidth: 0.5,
			borderRightWidth: 0.5,
			borderColor: "#374151",
		},
		// Column widths
		colNo: { width: 28, textAlign: "center", paddingVertical: 4 * s, paddingHorizontal: 4 },
		colDesc: { flex: 1, paddingVertical: 4 * s, paddingHorizontal: 6 },
		colUnit: { width: 44, textAlign: "center", paddingVertical: 4 * s, paddingHorizontal: 4 },
		colHarga: { width: 90, textAlign: "right", paddingVertical: 4 * s, paddingHorizontal: 6 },
		colNilai: { width: 90, textAlign: "right", paddingVertical: 4 * s, paddingHorizontal: 6 },
		// Vertical dividers inside rows
		cellBorder: { borderLeftWidth: 0.5, borderLeftColor: "#374151" },
		headerCellText: { fontSize: 10 * s, fontFamily: "Helvetica-Bold", textAlign: "center" },
		cellText: { fontSize: 10 * s },
		totalLabelCell: {
			flex: 1,
			textAlign: "right",
			paddingVertical: 4 * s,
			paddingHorizontal: 6,
			fontFamily: "Helvetica-Bold",
			fontSize: 10 * s,
		},
		totalValueCell: {
			width: 90,
			textAlign: "right",
			paddingVertical: 4 * s,
			paddingHorizontal: 6,
			fontFamily: "Helvetica-Bold",
			fontSize: 10 * s,
		},
		// ── Bank info ────────────────────────────────────────────────────────────
		bankSection: { marginBottom: 14 * s },
		bankText: { fontSize: 11 * s, marginBottom: 1 },
		// ── Signature ────────────────────────────────────────────────────────────
		signatureRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 * s },
		signBlock: { width: 200, alignItems: "center" },
		signLabel: { fontSize: 11 * s, marginBottom: 1 },
		signCompany: { fontSize: 11 * s, fontFamily: "Helvetica-Bold", marginBottom: 8 * s },
		qrSeal: { width: 80 * s, height: 80 * s, marginBottom: 4 * s },
		qrSealLabel: { fontSize: 7 * s, color: "#6b7280", textAlign: "center", marginBottom: 8 * s },
		signName: { fontSize: 11 * s },
		signRole: { fontSize: 11 * s },
		// ── Footer ───────────────────────────────────────────────────────────────
		footer: {
			position: "absolute",
			bottom: 18,
			left: 56,
			right: 56,
			flexDirection: "row",
			alignItems: "center",
		},
		footerDocNumber: { flex: 1, fontSize: 7, color: "#9ca3af", textAlign: "left" },
		footerText: { flex: 1, fontSize: 8, color: "#dc2626", textAlign: "center" },
		footerPage: { flex: 1, fontSize: 7, color: "#9ca3af", textAlign: "right" },
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
	const displayDate = `${company.city}, ${formatIndonesianDate(invoice.created_at)}`;

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

	const totalFormatted = formatRupiahLetter(invoice.total_amount);

	return (
		<Document title={invoice.invoice_number} author={company.name} subject="Invoice">
			<Page size="A4" style={styles.page}>
				{/* Header */}
				<View style={styles.header}>
					{company.logo ? <PdfImage src={company.logo} style={styles.logo} /> : null}
					<Text style={styles.tagline}>{company.tagline}</Text>
					<Text style={styles.headerAddress}>
						{[company.address, company.phone ? `Telp ${company.phone}` : ""]
							.filter(Boolean)
							.join(", ")}
					</Text>
				</View>
				<View style={styles.divider} />

				{/* Invoice title + number */}
				<View style={styles.invoiceTitleBlock}>
					<Text style={styles.invoiceTitle}>INVOICE</Text>
					<Text style={styles.invoiceNumber}>
						No : {invoice.invoice_number}
						{invoice.label ? ` · ${invoice.label}` : ""}
					</Text>
					{invoice.parentNumber ? (
						<Text style={styles.invoiceNumber}>Termin dari {invoice.parentNumber}</Text>
					) : null}
				</View>

				{/* Date */}
				<Text style={styles.date}>{displayDate}</Text>

				{/* Recipient */}
				<View style={styles.recipient}>
					<Text style={styles.recipientLabel}>Kepada Yth,</Text>
					<Text style={styles.recipientName}>
						{formatCustomerName(customer.prefix, customer.name)}
					</Text>
					{customer.type === "corporate" && customer.company_name ? (
						<Text style={styles.recipientName}>{customer.company_name}</Text>
					) : null}
					{customer.address ? <Text style={styles.recipientName}>{customer.address}</Text> : null}
				</View>

				{/* Table */}
				<View style={styles.table}>
					{/* Header row */}
					<View style={styles.tableHeaderRow}>
						<Text style={[styles.colNo, { fontFamily: "Helvetica-Bold", fontSize: 10 }]}>No</Text>
						<Text
							style={[
								styles.colDesc,
								styles.cellBorder,
								{ fontFamily: "Helvetica-Bold", fontSize: 10, textAlign: "center" },
							]}
						>
							Deskripsi
						</Text>
						<Text
							style={[
								styles.colUnit,
								styles.cellBorder,
								{ fontFamily: "Helvetica-Bold", fontSize: 10 },
							]}
						>
							Unit
						</Text>
						<Text
							style={[
								styles.colHarga,
								styles.cellBorder,
								{ fontFamily: "Helvetica-Bold", fontSize: 10, textAlign: "center" },
							]}
						>
							Harga
						</Text>
						<Text
							style={[
								styles.colNilai,
								styles.cellBorder,
								{ fontFamily: "Helvetica-Bold", fontSize: 10, textAlign: "center" },
							]}
						>
							Nilai
						</Text>
					</View>

					{/* Data row */}
					<View style={styles.tableRow}>
						<Text style={[styles.colNo, styles.cellText]}>1</Text>
						<Text style={[styles.colDesc, styles.cellBorder, styles.cellText]}>{description}</Text>
						<Text style={[styles.colUnit, styles.cellBorder, styles.cellText]}>1</Text>
						<Text style={[styles.colHarga, styles.cellBorder, styles.cellText]}>
							{formatRupiahLetter(invoice.total_amount).replace(",-", "")}
						</Text>
						<Text style={[styles.colNilai, styles.cellBorder, styles.cellText]}>
							{formatRupiahLetter(invoice.total_amount).replace(",-", "")}
						</Text>
					</View>

					{/* Total row */}
					<View style={styles.tableTotalRow}>
						<Text style={[styles.totalLabelCell, { borderLeftWidth: 0 }]}>Jumlah</Text>
						<Text style={[styles.totalValueCell, styles.cellBorder]}>{totalFormatted}</Text>
					</View>
				</View>

				{/* Bank info */}
				<View style={styles.bankSection}>
					<Text style={styles.bankText}>
						Pembayaran untuk invoice ini mohon ditransfer ke rekening :
					</Text>
					<Text style={styles.bankText}>{template.bankName}</Text>
					<Text style={styles.bankText}>No. Rekening : {template.bankAccountNumber}</Text>
					<Text style={styles.bankText}>Atas nama : {template.bankAccountHolder}</Text>
				</View>

				{/* Signature — kept atomic so the QR / name / role never split across pages */}
				<View style={styles.signatureRow} wrap={false}>
					<View style={styles.signBlock} wrap={false}>
						<Text style={styles.signLabel}>Hormat kami,</Text>
						<Text style={styles.signCompany}>{company.name.toUpperCase()}</Text>
						{template.verificationQrUrl ? (
							<>
								<Link src={template.verificationUrl}>
									<PdfImage src={template.verificationQrUrl} style={styles.qrSeal} />
								</Link>
								<Text style={styles.qrSealLabel}>Pindai untuk verifikasi</Text>
							</>
						) : null}
						<Text style={styles.signName}>{template.signatureName}</Text>
						{template.signatureRole ? (
							<Text style={styles.signRole}>({template.signatureRole})</Text>
						) : null}
					</View>
				</View>

				{/* Footer — doc number (traceability) · website · page X of Y */}
				<View style={styles.footer} fixed>
					<Text style={styles.footerDocNumber}>{invoice.invoice_number}</Text>
					<Text style={styles.footerText}>{company.website}</Text>
					<Text
						style={styles.footerPage}
						render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`}
					/>
				</View>
			</Page>
		</Document>
	);
}

export function buildInvoiceFilename(invoiceNumber: string): string {
	return `${invoiceNumber.replace(/\//g, "-")}.pdf`;
}
