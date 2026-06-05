"use client";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ProposalCustomFields } from "@/lib/proposalCustomFields";
import {
	formatIndonesianDate,
	formatRupiahLetter,
	numberToIndonesianWords,
	toRomanMonth,
} from "@/lib/utils";

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
	header: {
		alignItems: "center",
		marginBottom: 6,
	},
	logo: {
		width: 72,
		height: 72,
		marginBottom: 4,
		objectFit: "contain",
	},
	tagline: {
		fontSize: 8,
		textAlign: "center",
		color: "#374151",
		marginTop: 2,
		letterSpacing: 0.2,
	},
	headerAddress: {
		fontSize: 8,
		textAlign: "center",
		color: "#374151",
		marginTop: 1,
	},
	divider: {
		borderBottomWidth: 0.5,
		borderBottomColor: "#374151",
		marginBottom: 14,
		marginTop: 6,
	},
	// ── Body ────────────────────────────────────────────────────────────────
	date: { fontSize: 11, marginBottom: 14 },
	noHalRow: { flexDirection: "row", marginBottom: 2 },
	noHalLabel: { width: 30, fontSize: 11 },
	noHalColon: { width: 14, fontSize: 11 },
	noHalValue: { flex: 1, fontSize: 11 },
	noHalValueBold: { flex: 1, fontSize: 11, fontFamily: "Helvetica-Bold" },
	recipient: { marginTop: 14, marginBottom: 12 },
	recipientLabel: { fontSize: 11, marginBottom: 2 },
	recipientName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
	greeting: { fontSize: 11, marginBottom: 8 },
	para: { fontSize: 11, marginBottom: 8, textAlign: "justify", lineHeight: 1.5 },
	listContainer: { marginLeft: 14, marginBottom: 8 },
	listItem: { flexDirection: "row", marginBottom: 2 },
	listBullet: { width: 16, fontSize: 11 },
	listText: { flex: 1, fontSize: 11 },
	// ── Signature ────────────────────────────────────────────────────────────
	signatureRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },
	signBlock: { width: 200, alignItems: "center" },
	signLabel: { fontSize: 11, marginBottom: 1 },
	signCompany: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 48 },
	signName: { fontSize: 11, fontFamily: "Helvetica-Bold", textDecoration: "underline" },
	signRole: { fontSize: 11 },
	// ── Footer ───────────────────────────────────────────────────────────────
	footer: { position: "absolute", bottom: 18, left: 56, right: 56, textAlign: "center" },
	footerText: { fontSize: 8, color: "#dc2626", textAlign: "center" },
});

export interface ProposalPDFProps {
	proposal: {
		proposal_number: string;
		final_price: number | null;
		created_at: string;
		approved_at: string | null;
	};
	customer: {
		name: string;
		phone: string | null;
		email: string | null;
		type: "individual" | "corporate";
		company_name: string | null;
		address: string | null;
	};
	lead: {
		pickup_address: string | null;
		destination_address: string | null;
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
	template: { includedServices: string[]; signatureName: string; signatureRole: string };
	customFields?: ProposalCustomFields;
}

export function ProposalPDF({
	proposal,
	customer,
	lead,
	company,
	template,
	customFields = {},
}: ProposalPDFProps) {
	const displayDate = `${company.city}, ${formatIndonesianDate(proposal.created_at)}`;
	const price = proposal.final_price ?? 0;
	const priceFormatted = formatRupiahLetter(price);
	const priceWords = numberToIndonesianWords(price);
	const priceWordsDisplay = `${priceWords.charAt(0).toUpperCase()}${priceWords.slice(1)} rupiah`;

	const pickup = lead.pickup_address;
	const destination = lead.destination_address;
	const hasRoute = Boolean(pickup || destination);

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
					{/* eslint-disable-next-line jsx-a11y/alt-text */}
					{company.logo ? <Image src={company.logo} style={styles.logo} /> : null}
					<Text style={styles.tagline}>{company.tagline}</Text>
					<Text style={styles.headerAddress}>
						{company.address}, Telp {company.phone}
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
					<Text style={styles.recipientName}>{customer.name}</Text>
					{customer.type === "corporate" && customer.company_name ? (
						<Text style={styles.recipientName}>{customer.company_name}</Text>
					) : null}
					{customer.address ? <Text style={styles.recipientName}>{customer.address}</Text> : null}
				</View>

				{/* Greeting */}
				<Text style={styles.greeting}>Dengan hormat,</Text>

				{/* Paragraph 1 */}
				<Text style={styles.para}>
					{"      "}Bersama ini kami sampaikan surat penawaran pindah dari{" "}
					<Text style={{ fontFamily: "Helvetica-Bold" }}>{company.name.toUpperCase()}</Text>
					{
						", sebuah perusahaan pindah rumah dan kantor yang sudah berpengalaman menangani pindah barang untuk rute seluruh Indonesia."
					}
				</Text>

				{/* Paragraph 2 — route + price */}
				<Text style={styles.para}>
					{"      "}Berkaitan dengan hal tersebut di atas maka dengan ini kami memberikan proposal
					jasa pindah
					{hasRoute ? (
						<>
							{pickup ? (
								<>
									{" "}
									dari <Text style={{ fontFamily: "Helvetica-Bold" }}>{pickup}</Text>
								</>
							) : null}
							{destination ? (
								<>
									{" "}
									ke <Text style={{ fontFamily: "Helvetica-Bold" }}>{destination}</Text>
								</>
							) : null}
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
							{"      "}Dengan biaya tersebut, sudah termasuk :
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

				{/* Per-proposal: DP note */}
				{customFields.dp_note ? (
					<Text style={styles.para}>
						{"      "}
						{customFields.dp_note}
					</Text>
				) : null}

				{/* Per-proposal: custom conditions */}
				{customFields.custom_conditions ? (
					<Text style={styles.para}>
						{"      "}
						{customFields.custom_conditions}
					</Text>
				) : null}

				{/* Closing */}
				<Text style={styles.para}>
					{"      "}Untuk pembayaran harap dibayarkan lunas ketika barang sudah siap berangkat.
					Demikian penawaran jasa pindah tersebut kami sampaikan, atas perhatian dan kerjasamanya
					terima kasih.
				</Text>

				{/* Signature */}
				<View style={styles.signatureRow}>
					<View style={styles.signBlock}>
						<Text style={styles.signLabel}>Hormat kami,</Text>
						<Text style={styles.signCompany}>{company.name.toUpperCase()}</Text>
						<Text style={styles.signName}>{template.signatureName}</Text>
						<Text style={styles.signRole}>{template.signatureRole}</Text>
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

export function buildProposalFilename(proposalNumber: string) {
	return `Proposal_${proposalNumber.replace(/\//g, "-")}.pdf`;
}

export { toRomanMonth };
