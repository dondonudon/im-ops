"use client";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatIndonesianDate, formatRupiahLetter } from "@/lib/utils";

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
	page: {
		fontSize: 11,
		fontFamily: "Helvetica",
		paddingTop: 28,
		paddingBottom: 36,
		paddingHorizontal: 56,
		color: "#1f2937",
	},
	// ── Header ──────────────────────────────────────────────────────────────
	header: { alignItems: "center", marginBottom: 6 },
	logo: { width: 72, height: 72, marginBottom: 4, objectFit: "contain" },
	tagline: { fontSize: 8, textAlign: "center", color: "#374151", marginTop: 2, letterSpacing: 0.2 },
	headerAddress: { fontSize: 8, textAlign: "center", color: "#374151", marginTop: 1 },
	divider: {
		borderBottomWidth: 0.5,
		borderBottomColor: "#374151",
		marginBottom: 10,
		marginTop: 6,
	},
	// ── Invoice title ────────────────────────────────────────────────────────
	invoiceTitleBlock: { alignItems: "center", marginBottom: 12 },
	invoiceTitle: {
		fontSize: 13,
		fontFamily: "Helvetica-Bold",
		textDecoration: "underline",
		textAlign: "center",
	},
	invoiceNumber: { fontSize: 11, textAlign: "center", marginTop: 3 },
	// ── Meta ────────────────────────────────────────────────────────────────
	date: { fontSize: 11, marginBottom: 12 },
	recipient: { marginBottom: 12 },
	recipientLabel: { fontSize: 11, marginBottom: 2 },
	recipientName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
	// ── Table ────────────────────────────────────────────────────────────────
	table: { marginBottom: 12 },
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
	colNo: { width: 28, textAlign: "center", paddingVertical: 4, paddingHorizontal: 4 },
	colDesc: { flex: 1, paddingVertical: 4, paddingHorizontal: 6 },
	colUnit: { width: 44, textAlign: "center", paddingVertical: 4, paddingHorizontal: 4 },
	colHarga: { width: 90, textAlign: "right", paddingVertical: 4, paddingHorizontal: 6 },
	colNilai: { width: 90, textAlign: "right", paddingVertical: 4, paddingHorizontal: 6 },
	// Vertical dividers inside rows
	cellBorder: { borderLeftWidth: 0.5, borderLeftColor: "#374151" },
	headerCellText: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center" },
	cellText: { fontSize: 10 },
	totalLabelCell: {
		flex: 1,
		textAlign: "right",
		paddingVertical: 4,
		paddingHorizontal: 6,
		fontFamily: "Helvetica-Bold",
		fontSize: 10,
	},
	totalValueCell: {
		width: 90,
		textAlign: "right",
		paddingVertical: 4,
		paddingHorizontal: 6,
		fontFamily: "Helvetica-Bold",
		fontSize: 10,
	},
	// ── Bank info ────────────────────────────────────────────────────────────
	bankSection: { marginBottom: 14 },
	bankText: { fontSize: 11, marginBottom: 1 },
	// ── Signature ────────────────────────────────────────────────────────────
	signatureRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
	signBlock: { width: 200, alignItems: "center" },
	signLabel: { fontSize: 11, marginBottom: 1 },
	signCompany: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 48 },
	signName: { fontSize: 11 },
	signRole: { fontSize: 11 },
	// ── Footer ───────────────────────────────────────────────────────────────
	footer: { position: "absolute", bottom: 18, left: 56, right: 56 },
	footerText: { fontSize: 8, color: "#dc2626", textAlign: "center" },
});

export interface InvoicePDFProps {
	invoice: {
		invoice_number: string;
		total_amount: number;
		notes: string | null;
		created_at: string;
	};
	customer: {
		name: string;
		type: "individual" | "corporate";
		company_name: string | null;
		address: string | null;
	};
	lead: {
		pickup_address: string | null;
		destination_address: string | null;
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
	};
}

export function InvoicePDF({ invoice, customer, lead, company, template }: InvoicePDFProps) {
	const displayDate = `${company.city}, ${formatIndonesianDate(invoice.created_at)}`;

	// Build the line-item description
	const description =
		invoice.notes?.trim() ||
		(lead.pickup_address && lead.destination_address
			? `Pindah barang dari ${lead.pickup_address} ke ${lead.destination_address}`
			: lead.pickup_address
				? `Pindah barang dari ${lead.pickup_address}`
				: "Jasa pindah barang");

	const totalFormatted = formatRupiahLetter(invoice.total_amount);

	return (
		<Document title={invoice.invoice_number} author={company.name} subject="Invoice">
			<Page size="A4" style={styles.page}>
				{/* Header */}
				<View style={styles.header}>
					{/* eslint-disable-next-line jsx-a11y/alt-text */}
					{company.logo ? <Image src={company.logo} style={styles.logo} /> : null}
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
					<Text style={styles.invoiceNumber}>No : {invoice.invoice_number}</Text>
				</View>

				{/* Date */}
				<Text style={styles.date}>{displayDate}</Text>

				{/* Recipient */}
				<View style={styles.recipient}>
					<Text style={styles.recipientLabel}>Kepada Yth,</Text>
					<Text style={styles.recipientName}>{customer.name}</Text>
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

				{/* Signature */}
				<View style={styles.signatureRow}>
					<View style={styles.signBlock}>
						<Text style={styles.signLabel}>Hormat kami,</Text>
						<Text style={styles.signCompany}>{company.name.toUpperCase()}</Text>
						<Text style={styles.signName}>{template.signatureName}</Text>
						{template.signatureRole ? (
							<Text style={styles.signRole}>({template.signatureRole})</Text>
						) : null}
					</View>
				</View>

				{/* Footer */}
				<View style={styles.footer} fixed>
					<Text style={styles.footerText}>{company.website}</Text>
				</View>
			</Page>
		</Document>
	);
}

export function buildInvoiceFilename(invoiceNumber: string): string {
	return `${invoiceNumber.replace(/\//g, "-")}.pdf`;
}
