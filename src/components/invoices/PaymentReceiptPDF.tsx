"use client";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { CompanyHeader, DocFooter, SignatureSeal, StatusPill } from "@/components/pdf/PdfChrome";
import { PDF_COLOR, PDF_PAGE_PAD, registerPdfFonts } from "@/lib/pdf/theme";
import type { CompanySettings, ReceiptTemplateSettings } from "@/lib/pdfSettings";
import { formatIndonesianDate, formatRupiah, numberToIndonesianWords } from "@/lib/utils";

registerPdfFonts();

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

// Scale-aware styles. `s` (fitScale) shrinks font sizes and vertical spacing so
// an over-long receipt can be compacted onto one page (see pdfFit.ts).
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
		// ── Title row ───────────────────────────────────────────────────────────
		titleRow: {
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "flex-start",
			marginBottom: 14 * s,
		},
		title: {
			fontSize: 17 * s,
			lineHeight: 1.2,
			fontWeight: 700,
			color: PDF_COLOR.brand,
			letterSpacing: 0.4,
		},
		titleSub: { fontSize: 9 * s, color: PDF_COLOR.inkMuted, marginTop: 4 * s },
		// ── Amount hero ─────────────────────────────────────────────────────────
		hero: {
			backgroundColor: PDF_COLOR.brandTint,
			borderLeftWidth: 3,
			borderLeftColor: PDF_COLOR.brand,
			borderRadius: 5,
			paddingVertical: 12 * s,
			paddingHorizontal: 14 * s,
			marginBottom: 14 * s,
		},
		heroLabel: {
			fontSize: 8 * s,
			fontWeight: 600,
			color: PDF_COLOR.brand,
			letterSpacing: 0.6,
			textTransform: "uppercase",
		},
		heroAmount: {
			fontSize: 22 * s,
			lineHeight: 1.2,
			fontWeight: 700,
			color: PDF_COLOR.brand,
			marginTop: 3 * s,
		},
		heroWords: {
			fontSize: 8.5 * s,
			fontStyle: "italic",
			color: PDF_COLOR.inkMuted,
			marginTop: 3 * s,
		},
		// ── Details grid ────────────────────────────────────────────────────────
		grid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 * s },
		cell: { width: "50%", marginBottom: 9 * s, paddingRight: 12 },
		cellLabel: {
			fontSize: 7.5 * s,
			fontWeight: 600,
			color: PDF_COLOR.inkFaint,
			letterSpacing: 0.5,
			textTransform: "uppercase",
			marginBottom: 2 * s,
		},
		cellValue: { fontSize: 10 * s, fontWeight: 500, color: PDF_COLOR.ink },
		// ── Running balance ─────────────────────────────────────────────────────
		balanceBox: {
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "center",
			backgroundColor: PDF_COLOR.surfaceSunken,
			borderRadius: 5,
			paddingVertical: 8 * s,
			paddingHorizontal: 12 * s,
			marginBottom: 10 * s,
		},
		balanceLabel: { fontSize: 9 * s, color: PDF_COLOR.inkMuted },
		balanceValue: { fontSize: 11 * s, fontWeight: 700, color: PDF_COLOR.ink },
		balanceLunas: {
			fontSize: 10 * s,
			fontWeight: 700,
			color: PDF_COLOR.successText,
			letterSpacing: 0.6,
			textTransform: "uppercase",
		},
		// ── Notes ───────────────────────────────────────────────────────────────
		notes: {
			fontSize: 8.5 * s,
			color: PDF_COLOR.inkMuted,
			backgroundColor: PDF_COLOR.surfaceSunken,
			borderRadius: 4,
			padding: 8 * s,
			marginBottom: 8 * s,
		},
	});
}

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
	/** Outstanding balance immediately after this payment (optional). Omitted → line hidden. */
	balanceAfter?: number | null;
	company: CompanySettings;
	template: ReceiptTemplateSettings;
	/** Fit-to-one-page scale (1 = default). Set by the download button's fit loop. */
	fitScale?: number;
}

export function PaymentReceiptPDF({
	payment,
	receiptNumber,
	jobNumber,
	customerName,
	invoiceNumber,
	balanceAfter,
	company,
	template,
	fitScale = 1,
}: PaymentReceiptProps) {
	const styles = makeStyles(fitScale);
	const receiptRef = `${jobNumber}/${String(receiptNumber).padStart(3, "0")}`;
	const displayDate = formatIndonesianDate(payment.paid_at);
	const typeLabel = PAYMENT_TYPE_LABELS[payment.payment_type] ?? payment.payment_type;
	const methodLabel = payment.method
		? (PAYMENT_METHOD_LABELS[payment.method] ?? payment.method)
		: "—";
	const isRefund = payment.payment_type === "refund";
	const amountFormatted = formatRupiah(payment.amount);
	const amountInWords = `${numberToIndonesianWords(Math.round(payment.amount))} rupiah`;
	const showBalance = !isRefund && balanceAfter != null;
	const settled = (balanceAfter ?? 0) <= 0;

	return (
		<Document title={`Kwitansi-${receiptRef}`} author={company.name} subject="Kwitansi Pembayaran">
			<Page size="A4" style={styles.page}>
				<CompanyHeader company={company} scale={fitScale} />

				{/* Title + status */}
				<View style={styles.titleRow}>
					<View>
						<Text style={styles.title}>KWITANSI PEMBAYARAN</Text>
						<Text style={styles.titleSub}>No. {receiptRef}</Text>
					</View>
					<StatusPill
						label={isRefund ? "Dana Dikembalikan" : "Pembayaran Diterima"}
						tone={isRefund ? "warn" : "success"}
						scale={fitScale}
					/>
				</View>

				{/* Amount hero */}
				<View style={styles.hero}>
					<Text style={styles.heroLabel}>
						{isRefund ? "Jumlah Dikembalikan" : "Jumlah Diterima"}
					</Text>
					<Text style={styles.heroAmount}>{amountFormatted}</Text>
					<Text style={styles.heroWords}>Terbilang: {amountInWords}</Text>
				</View>

				{/* Details grid */}
				<View style={styles.grid}>
					<View style={styles.cell}>
						<Text style={styles.cellLabel}>
							{isRefund ? "Dikembalikan Kepada" : "Diterima Dari"}
						</Text>
						<Text style={styles.cellValue}>{customerName}</Text>
					</View>
					<View style={styles.cell}>
						<Text style={styles.cellLabel}>Tanggal</Text>
						<Text style={styles.cellValue}>{displayDate}</Text>
					</View>
					<View style={styles.cell}>
						<Text style={styles.cellLabel}>No. Pekerjaan</Text>
						<Text style={styles.cellValue}>{jobNumber}</Text>
					</View>
					{invoiceNumber ? (
						<View style={styles.cell}>
							<Text style={styles.cellLabel}>No. Invoice</Text>
							<Text style={styles.cellValue}>{invoiceNumber}</Text>
						</View>
					) : null}
					<View style={styles.cell}>
						<Text style={styles.cellLabel}>Untuk Pembayaran</Text>
						<Text style={styles.cellValue}>{typeLabel}</Text>
					</View>
					<View style={styles.cell}>
						<Text style={styles.cellLabel}>Metode</Text>
						<Text style={styles.cellValue}>{methodLabel}</Text>
					</View>
				</View>

				{showBalance ? (
					<View style={styles.balanceBox}>
						<Text style={styles.balanceLabel}>Sisa tagihan setelah pembayaran ini</Text>
						{settled ? (
							<Text style={styles.balanceLunas}>Lunas</Text>
						) : (
							<Text style={styles.balanceValue}>{formatRupiah(balanceAfter as number)}</Text>
						)}
					</View>
				) : null}

				{payment.notes ? <Text style={styles.notes}>Keterangan: {payment.notes}</Text> : null}

				<SignatureSeal
					company={company}
					name={template.signatureName}
					role={template.signatureRole}
					qrUrl={template.verificationQrUrl}
					verifyUrl={template.verificationUrl}
					scale={fitScale}
				/>

				<DocFooter docNumber={receiptRef} website={company.website} scale={fitScale} />
			</Page>
		</Document>
	);
}

export function buildReceiptFilename(jobNumber: string, receiptNumber: number): string {
	return `Kwitansi-${jobNumber.replace(/\//g, "-")}-${String(receiptNumber).padStart(3, "0")}.pdf`;
}
