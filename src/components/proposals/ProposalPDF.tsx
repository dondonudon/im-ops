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
import { Fragment } from "react";
import type { ProposalCustomFields } from "@/lib/proposalCustomFields";
import {
	formatCustomerName,
	formatIndonesianDate,
	formatRupiahLetter,
	numberToIndonesianWords,
	toRomanMonth,
} from "@/lib/utils";

Font.registerHyphenationCallback((word) => [word]);

// Scale-aware styles. `s` (fitScale) shrinks font sizes and vertical spacing
// so an over-long document can be compacted back onto one page (see pdfFit.ts).
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
		header: {
			alignItems: "center",
			marginBottom: 6 * s,
		},
		logo: {
			width: 72 * s,
			height: 72 * s,
			marginBottom: 4 * s,
			objectFit: "contain",
		},
		tagline: {
			fontSize: 8 * s,
			textAlign: "center",
			color: "#374151",
			marginTop: 2,
			letterSpacing: 0.2,
		},
		headerAddress: {
			fontSize: 8 * s,
			textAlign: "center",
			color: "#374151",
			marginTop: 1,
		},
		divider: {
			borderBottomWidth: 0.5,
			borderBottomColor: "#374151",
			marginBottom: 14 * s,
			marginTop: 6 * s,
		},
		// ── Body ────────────────────────────────────────────────────────────────
		date: { fontSize: 11 * s, marginBottom: 14 * s },
		noHalRow: { flexDirection: "row", marginBottom: 2 * s },
		noHalLabel: { width: 30, fontSize: 11 * s },
		noHalColon: { width: 14, fontSize: 11 * s },
		noHalValue: { flex: 1, fontSize: 11 * s },
		noHalValueBold: { flex: 1, fontSize: 11 * s, fontFamily: "Helvetica-Bold" },
		recipient: { marginTop: 14 * s, marginBottom: 12 * s },
		recipientLabel: { fontSize: 11 * s, marginBottom: 2 * s },
		recipientName: { fontSize: 11 * s, fontFamily: "Helvetica-Bold" },
		greeting: { fontSize: 11 * s, marginBottom: 8 * s },
		para: { fontSize: 11 * s, marginBottom: 8 * s, textAlign: "justify", lineHeight: 1.5 },
		listContainer: { marginLeft: 14, marginBottom: 8 * s },
		listItem: { flexDirection: "row", marginBottom: 2 * s },
		listBullet: { width: 16, fontSize: 11 * s },
		listText: { flex: 1, fontSize: 11 * s },
		// ── Signature ────────────────────────────────────────────────────────────
		signatureRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 * s },
		signBlock: { width: 200, alignItems: "center" },
		signLabel: { fontSize: 11 * s, marginBottom: 1 },
		signCompany: { fontSize: 11 * s, fontFamily: "Helvetica-Bold", marginBottom: 8 * s },
		qrSeal: { width: 80 * s, height: 80 * s, marginBottom: 4 * s },
		qrSealLabel: { fontSize: 7 * s, color: "#6b7280", textAlign: "center", marginBottom: 8 * s },
		signName: { fontSize: 11 * s, fontFamily: "Helvetica-Bold", textDecoration: "underline" },
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

export interface ProposalPDFProps {
	proposal: {
		proposal_number: string;
		final_price: number | null;
		created_at: string;
		approved_at: string | null;
	};
	customer: {
		prefix: string | null;
		name: string;
		phone: string | null;
		email: string | null;
		type: "individual" | "corporate";
		company_name: string | null;
		address: string | null;
	};
	lead: {
		pickups: string[];
		destinations: string[];
		preferred_date: string | null;
	};
	outputs: Record<string, number>;
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
		includedServices: string[];
		signatureName: string;
		signatureRole: string;
		verificationQrUrl: string;
		verificationUrl: string;
	};
	customFields?: ProposalCustomFields;
	/** Fit-to-one-page scale (1 = default). Set by the download button's fit loop. */
	fitScale?: number;
}

export function ProposalPDF({
	proposal,
	customer,
	lead,
	company,
	template,
	customFields = {},
	fitScale = 1,
}: ProposalPDFProps) {
	const styles = makeStyles(fitScale);
	const displayDate = `${company.city}, ${formatIndonesianDate(proposal.created_at)}`;
	const price = proposal.final_price ?? 0;
	const priceFormatted = formatRupiahLetter(price);
	const priceWords = numberToIndonesianWords(price);
	const priceWordsDisplay = `${priceWords.charAt(0).toUpperCase()}${priceWords.slice(1)} rupiah`;

	const pickups = lead.pickups;
	const destinations = lead.destinations;
	const hasRoute = pickups.length > 0 || destinations.length > 0;

	const effectiveServices = customFields.override_services
		? customFields.override_services
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean)
		: template.includedServices;

	return (
		<Document title={`Proposal ${proposal.proposal_number}`} author={company.name}>
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

				{/* Date */}
				<Text style={styles.date}>{displayDate}</Text>

				{/* No / Hal */}
				<View style={styles.noHalRow}>
					<Text style={styles.noHalLabel}>No</Text>
					<Text style={styles.noHalColon}>:</Text>
					<Text style={styles.noHalValue}>{proposal.proposal_number}</Text>
				</View>
				<View style={styles.noHalRow}>
					<Text style={styles.noHalLabel}>Hal</Text>
					<Text style={styles.noHalColon}>:</Text>
					<Text style={styles.noHalValueBold}>Penawaran Jasa Pindah</Text>
				</View>

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

				{/* Greeting */}
				<Text style={styles.greeting}>Dengan hormat,</Text>

				{/* Paragraph 1 */}
				<Text style={styles.para}>
					{"            "}Bersama ini kami sampaikan surat penawaran pindah dari{" "}
					<Text style={{ fontFamily: "Helvetica-Bold" }}>{company.name.toUpperCase()}</Text>
					{
						", sebuah perusahaan pindah rumah dan kantor yang sudah berpengalaman menangani pindah barang untuk rute seluruh Indonesia."
					}
				</Text>

				{/* Paragraph 2 — route + price */}
				<Text style={styles.para}>
					{"            "}Berkaitan dengan hal tersebut di atas maka dengan ini kami memberikan
					proposal jasa pindah
					{hasRoute ? (
						<>
							{pickups.length > 0 ? (
								<>
									{" dari "}
									<Text style={{ fontFamily: "Helvetica-Bold" }}>
										{pickups.map((p) => p.replace(/\n/g, " ")).join(", ")}
									</Text>
								</>
							) : null}
							{destinations.map((d, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed render list; index also drives the connector text
								<Fragment key={`dest-${i}-${d}`}>
									{i === 0 ? " ke " : ", lalu ke "}
									<Text style={{ fontFamily: "Helvetica-Bold" }}>{d.replace(/\n/g, " ")}</Text>
								</Fragment>
							))}
						</>
					) : null}
					{price > 0 ? (
						<>
							{". Sehingga biayanya menjadi "}
							<Text style={{ fontFamily: "Helvetica-Bold" }}>
								{priceFormatted}
								{customFields.price_suffix ? ` ${customFields.price_suffix}` : ""}
							</Text>{" "}
							<Text style={{ fontFamily: "Helvetica-BoldOblique" }}>({priceWordsDisplay}).</Text>
						</>
					) : (
						"."
					)}
				</Text>

				{/* Included services */}
				{effectiveServices.length > 0 && (
					<>
						<Text style={[styles.para, { marginBottom: 4 }]}>
							{"            "}Dengan biaya tersebut, sudah termasuk :
						</Text>
						<View style={styles.listContainer}>
							{effectiveServices.map((svc) => (
								<View key={svc} style={styles.listItem}>
									<Text style={styles.listBullet}>-</Text>
									<Text style={styles.listText}>{svc}</Text>
								</View>
							))}
						</View>
					</>
				)}

				{/* Per-proposal: custom conditions */}
				{customFields.custom_conditions ? (
					<Text style={styles.para}>
						{"            "}
						{customFields.custom_conditions}
					</Text>
				) : null}

				{/* Closing */}
				<Text style={styles.para}>
					{"            "}Untuk pembayaran, DP sebesar 30% dibayarkan di muka dan dilunasi setelah
					seluruh barang selesai diturunkan di tempat tujuan. Demikian penawaran jasa pindah
					tersebut kami sampaikan, atas perhatian dan kerjasamanya terima kasih.
				</Text>

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
						<Text style={styles.signRole}>{template.signatureRole}</Text>
					</View>
				</View>

				{/* Footer — doc number (traceability) · website · page X of Y */}
				<View style={styles.footer} fixed>
					<Text style={styles.footerDocNumber}>{proposal.proposal_number}</Text>
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

export function buildProposalFilename(proposalNumber: string) {
	return `Proposal_${proposalNumber.replace(/\//g, "-")}.pdf`;
}

export { toRomanMonth };
