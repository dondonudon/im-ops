"use client";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CompanySettings } from "@/lib/pdfSettings";
import { formatIndonesianDate, formatRupiahLetter } from "@/lib/utils";

Font.registerHyphenationCallback((word) => [word]);

const PAYMENT_TYPE_LABELS: Record<string, string> = {
	down_payment: "Uang Muka",
	partial: "Pembayaran Sebagian",
	final: "Pelunasan",
	refund: "Refund",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
	cash: "Tunai",
	transfer: "Transfer Bank",
};

const styles = StyleSheet.create({
	page: {
		fontSize: 11,
		fontFamily: "Helvetica",
		paddingTop: 28,
		paddingBottom: 36,
		paddingHorizontal: 56,
		color: "#1f2937",
	},
	header: { alignItems: "center", marginBottom: 6 },
	logo: { width: 60, height: 60, marginBottom: 4, objectFit: "contain" },
	tagline: { fontSize: 8, textAlign: "center", color: "#374151", marginTop: 2, letterSpacing: 0.2 },
	headerAddress: { fontSize: 8, textAlign: "center", color: "#374151", marginTop: 1 },
	divider: {
		borderBottomWidth: 0.5,
		borderBottomColor: "#374151",
		marginBottom: 10,
		marginTop: 6,
	},
	titleBlock: { alignItems: "center", marginBottom: 14 },
	title: {
		fontSize: 13,
		fontFamily: "Helvetica-Bold",
		textDecoration: "underline",
		textAlign: "center",
	},
	metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
	metaLabel: { fontSize: 11, color: "#374151", width: 100 },
	metaValue: { fontSize: 11, flex: 1 },
	metaDate: { fontSize: 11, color: "#374151" },
	refSection: { marginBottom: 14 },
	refRow: { flexDirection: "row", marginBottom: 3 },
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
	cellBorder: { borderLeftWidth: 0.5, borderLeftColor: "#374151" },
	colDesc: { flex: 1, paddingVertical: 4, paddingHorizontal: 6 },
	colAmount: { width: 130, textAlign: "right", paddingVertical: 4, paddingHorizontal: 6 },
	headerCellText: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center" },
	cellText: { fontSize: 10 },
	cellSubText: { fontSize: 9, color: "#6b7280" },
	totalLabelCell: {
		flex: 1,
		textAlign: "right",
		paddingVertical: 4,
		paddingHorizontal: 6,
		fontFamily: "Helvetica-Bold",
		fontSize: 10,
	},
	totalValueCell: {
		width: 130,
		textAlign: "right",
		paddingVertical: 4,
		paddingHorizontal: 6,
		fontFamily: "Helvetica-Bold",
		fontSize: 10,
	},
	terbilang: { fontSize: 10, fontStyle: "italic", marginBottom: 8 },
	notes: { fontSize: 10, color: "#374151", marginBottom: 14 },
	signatureRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
	signBlock: { width: 200, alignItems: "center" },
	signLabel: { fontSize: 11, marginBottom: 1 },
	signCompany: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 48 },
	signName: { fontSize: 11 },
	signRole: { fontSize: 11 },
	footer: { position: "absolute", bottom: 18, left: 56, right: 56 },
	footerText: { fontSize: 8, color: "#dc2626", textAlign: "center" },
});

export interface PaymentReceiptProps {
	payment: {
		id: string;
		payment_type: string;
		method: string | null;
		amount: number;
		paid_at: string;
		notes: string | null;
	};
	receiptNumber: number;
	jobNumber: string;
	customerName: string;
	invoiceNumber?: string | null;
	company: CompanySettings;
	template: {
		signatureName: string;
		signatureRole: string;
	};
}

export function PaymentReceiptPDF({
	payment,
	receiptNumber,
	jobNumber,
	customerName,
	invoiceNumber,
	company,
	template,
}: PaymentReceiptProps) {
	const receiptRef = `${jobNumber}/${String(receiptNumber).padStart(3, "0")}`;
	const displayDate = `${company.city}, ${formatIndonesianDate(payment.paid_at)}`;
	const typeLabel = PAYMENT_TYPE_LABELS[payment.payment_type] ?? payment.payment_type;
	const methodLabel = payment.method
		? (PAYMENT_METHOD_LABELS[payment.method] ?? payment.method)
		: "—";
	const amountFormatted = formatRupiahLetter(payment.amount);

	return (
		<Document title={`Kwitansi-${receiptRef}`} author={company.name} subject="Kwitansi Pembayaran">
			<Page size="A4" style={styles.page}>
				{/* Header */}
				<View style={styles.header}>
					{company.logo ? (
						// eslint-disable-next-line jsx-a11y/alt-text
						<Image src={company.logo} style={styles.logo} />
					) : null}
					<Text style={styles.tagline}>{company.tagline}</Text>
					<Text style={styles.headerAddress}>
						{[company.address, company.phone ? `Telp ${company.phone}` : ""]
							.filter(Boolean)
							.join(", ")}
					</Text>
				</View>
				<View style={styles.divider} />

				{/* Title */}
				<View style={styles.titleBlock}>
					<Text style={styles.title}>KWITANSI PEMBAYARAN</Text>
				</View>

				{/* Receipt no + date */}
				<View style={styles.metaRow}>
					<View style={[styles.refRow, { flex: 1 }]}>
						<Text style={styles.metaLabel}>No.</Text>
						<Text style={styles.metaValue}>: {receiptRef}</Text>
					</View>
					<Text style={styles.metaDate}>{displayDate}</Text>
				</View>

				{/* References */}
				<View style={styles.refSection}>
					<View style={styles.refRow}>
						<Text style={styles.metaLabel}>Diterima dari</Text>
						<Text style={styles.metaValue}>: {customerName}</Text>
					</View>
					<View style={styles.refRow}>
						<Text style={styles.metaLabel}>No. Pekerjaan</Text>
						<Text style={styles.metaValue}>: {jobNumber}</Text>
					</View>
					{invoiceNumber ? (
						<View style={styles.refRow}>
							<Text style={styles.metaLabel}>No. Invoice</Text>
							<Text style={styles.metaValue}>: {invoiceNumber}</Text>
						</View>
					) : null}
				</View>

				{/* Table */}
				<View style={styles.table}>
					<View style={styles.tableHeaderRow}>
						<Text
							style={[
								styles.colDesc,
								{ fontFamily: "Helvetica-Bold", fontSize: 10, textAlign: "center" },
							]}
						>
							Keterangan
						</Text>
						<Text style={[styles.colAmount, styles.cellBorder, styles.headerCellText]}>Jumlah</Text>
					</View>
					<View style={styles.tableRow}>
						<View style={styles.colDesc}>
							<Text style={styles.cellText}>{typeLabel}</Text>
							<Text style={styles.cellSubText}>via {methodLabel}</Text>
						</View>
						<Text style={[styles.colAmount, styles.cellBorder, styles.cellText]}>
							{amountFormatted.replace(",-", "")}
						</Text>
					</View>
					<View style={styles.tableRow}>
						<Text style={[styles.totalLabelCell, { borderLeftWidth: 0 }]}>Total</Text>
						<Text style={[styles.totalValueCell, styles.cellBorder]}>{amountFormatted}</Text>
					</View>
				</View>

				{/* Terbilang */}
				<Text style={styles.terbilang}>Terbilang: {amountFormatted}</Text>

				{/* Notes */}
				{payment.notes ? <Text style={styles.notes}>Keterangan: {payment.notes}</Text> : null}

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

export function buildReceiptFilename(jobNumber: string, receiptNumber: number): string {
	return `Kwitansi-${jobNumber.replace(/\//g, "-")}-${String(receiptNumber).padStart(3, "0")}.pdf`;
}
