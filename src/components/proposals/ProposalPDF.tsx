"use client";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { Fragment } from "react";
import { CompanyHeader, DocFooter, SignatureSeal } from "@/components/pdf/PdfChrome";
import { PDF_COLOR, PDF_PAGE_PAD, registerPdfFonts } from "@/lib/pdf/theme";
import type { ProposalCustomFields } from "@/lib/proposalCustomFields";
import {
	formatCustomerName,
	formatIndonesianDate,
	formatRupiahLetter,
	numberToIndonesianWords,
	toRomanMonth,
} from "@/lib/utils";

registerPdfFonts();

function addDaysIso(iso: string, days: number): string {
	const d = new Date(iso);
	d.setDate(d.getDate() + days);
	return d.toISOString();
}

// Scale-aware styles. `s` (fitScale) shrinks font sizes and vertical spacing so
// an over-long proposal can be compacted onto one page (see pdfFit.ts).
function makeStyles(s: number) {
	return StyleSheet.create({
		page: {
			fontFamily: "Inter",
			fontSize: 10 * s,
			color: PDF_COLOR.ink,
			paddingTop: 34 * s,
			paddingBottom: 46,
			paddingHorizontal: PDF_PAGE_PAD,
			// NOTE: never set `lineHeight` on the Page style — react-pdf then drops
			// the fixed absolutely-positioned footer. Set it per text block instead.
		},
		// ── Letter meta ─────────────────────────────────────────────────────────
		date: { fontSize: 10 * s, color: PDF_COLOR.inkMuted, textAlign: "right", marginBottom: 12 * s },
		noHalRow: { flexDirection: "row", marginBottom: 2 * s },
		noHalLabel: { width: 30, fontSize: 10 * s, color: PDF_COLOR.inkMuted },
		noHalColon: { width: 12, fontSize: 10 * s, color: PDF_COLOR.inkMuted },
		noHalValue: { flex: 1, fontSize: 10 * s },
		noHalValueBold: { flex: 1, fontSize: 10 * s, fontWeight: 700 },
		recipient: { marginTop: 12 * s, marginBottom: 12 * s },
		recipientLabel: { fontSize: 10 * s, color: PDF_COLOR.inkMuted, marginBottom: 2 * s },
		recipientName: { fontSize: 11 * s, fontWeight: 600 },
		recipientLine: { fontSize: 10 * s, color: PDF_COLOR.inkMuted, marginTop: 1 },
		// ── Ringkasan card ──────────────────────────────────────────────────────
		summary: {
			backgroundColor: PDF_COLOR.surfaceSunken,
			borderLeftWidth: 3,
			borderLeftColor: PDF_COLOR.brand,
			borderRadius: 5,
			paddingVertical: 9 * s,
			paddingHorizontal: 12 * s,
			marginBottom: 14 * s,
		},
		summaryHeading: {
			fontSize: 7.5 * s,
			fontWeight: 700,
			color: PDF_COLOR.brand,
			letterSpacing: 0.6,
			textTransform: "uppercase",
			marginBottom: 5 * s,
		},
		summaryRow: { flexDirection: "row", marginBottom: 3 * s },
		summaryKey: { width: 92, fontSize: 9 * s, color: PDF_COLOR.inkMuted },
		summaryVal: { flex: 1, fontSize: 9.5 * s, fontWeight: 500 },
		summaryPrice: { flex: 1, fontSize: 11 * s, fontWeight: 700, color: PDF_COLOR.brand },
		// ── Body ────────────────────────────────────────────────────────────────
		greeting: { fontSize: 10 * s, marginBottom: 8 * s },
		para: { fontSize: 10 * s, marginBottom: 8 * s, textAlign: "justify", lineHeight: 1.6 },
		bold: { fontWeight: 700 },
		boldItalic: { fontWeight: 700, fontStyle: "italic" },
		listContainer: { marginLeft: 6, marginBottom: 8 * s },
		listItem: { flexDirection: "row", marginBottom: 3 * s },
		listBullet: { width: 12, fontSize: 10 * s, color: PDF_COLOR.brand },
		listText: { flex: 1, fontSize: 10 * s },
		validity: {
			fontSize: 8.5 * s,
			color: PDF_COLOR.inkMuted,
			fontStyle: "italic",
			marginTop: 2 * s,
			marginBottom: 4 * s,
		},
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
		validDays: number;
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
	const validUntil = formatIndonesianDate(addDaysIso(proposal.created_at, template.validDays));
	const price = proposal.final_price ?? 0;
	const priceFormatted = formatRupiahLetter(price);
	const priceWords = numberToIndonesianWords(price);
	const priceWordsDisplay = `${priceWords.charAt(0).toUpperCase()}${priceWords.slice(1)} rupiah`;

	const pickups = lead.pickups;
	const destinations = lead.destinations;
	const hasRoute = pickups.length > 0 || destinations.length > 0;
	const routeText = [
		pickups.map((p) => p.replace(/\n/g, " ")).join(", "),
		destinations.map((d) => d.replace(/\n/g, " ")).join(", "),
	]
		.filter(Boolean)
		.join("  →  ");

	const effectiveServices = customFields.override_services
		? customFields.override_services
				.split("\n")
				.map((svc) => svc.trim())
				.filter(Boolean)
		: template.includedServices;

	return (
		<Document title={`Proposal ${proposal.proposal_number}`} author={company.name}>
			<Page size="A4" style={styles.page}>
				<CompanyHeader company={company} scale={fitScale} />

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
						<Text style={styles.recipientLine}>{customer.company_name}</Text>
					) : null}
					{customer.address ? <Text style={styles.recipientLine}>{customer.address}</Text> : null}
				</View>

				{/* Ringkasan penawaran — at-a-glance recap */}
				{hasRoute || price > 0 ? (
					<View style={styles.summary}>
						<Text style={styles.summaryHeading}>Ringkasan Penawaran</Text>
						{routeText ? (
							<View style={styles.summaryRow}>
								<Text style={styles.summaryKey}>Rute</Text>
								<Text style={styles.summaryVal}>{routeText}</Text>
							</View>
						) : null}
						<View style={styles.summaryRow}>
							<Text style={styles.summaryKey}>Tanggal Pindah</Text>
							<Text style={styles.summaryVal}>
								{lead.preferred_date ? formatIndonesianDate(lead.preferred_date) : "Menyesuaikan"}
							</Text>
						</View>
						{price > 0 ? (
							<View style={styles.summaryRow}>
								<Text style={styles.summaryKey}>Nilai Penawaran</Text>
								<Text style={styles.summaryPrice}>{priceFormatted}</Text>
							</View>
						) : null}
					</View>
				) : null}

				{/* Greeting */}
				<Text style={styles.greeting}>Dengan hormat,</Text>

				{/* Paragraph 1 */}
				<Text style={styles.para}>
					{"            "}Bersama ini kami sampaikan surat penawaran pindah dari{" "}
					<Text style={styles.bold}>{company.name.toUpperCase()}</Text>
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
									<Text style={styles.bold}>
										{pickups.map((p) => p.replace(/\n/g, " ")).join(", ")}
									</Text>
								</>
							) : null}
							{destinations.map((d, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed render list; index also drives the connector text
								<Fragment key={`dest-${i}-${d}`}>
									{i === 0 ? " ke " : ", lalu ke "}
									<Text style={styles.bold}>{d.replace(/\n/g, " ")}</Text>
								</Fragment>
							))}
						</>
					) : null}
					{price > 0 ? (
						<>
							{". Sehingga biayanya menjadi "}
							<Text style={styles.bold}>
								{priceFormatted}
								{customFields.price_suffix ? ` ${customFields.price_suffix}` : ""}
							</Text>{" "}
							<Text style={styles.boldItalic}>({priceWordsDisplay}).</Text>
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
									<Text style={styles.listBullet}>•</Text>
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

				<Text style={styles.validity}>Penawaran ini berlaku hingga {validUntil}.</Text>

				<SignatureSeal
					company={company}
					name={template.signatureName}
					role={template.signatureRole}
					qrUrl={template.verificationQrUrl}
					verifyUrl={template.verificationUrl}
					scale={fitScale}
				/>

				<DocFooter
					docNumber={proposal.proposal_number}
					website={company.website}
					scale={fitScale}
				/>
			</Page>
		</Document>
	);
}

export function buildProposalFilename(proposalNumber: string) {
	return `Proposal_${proposalNumber.replace(/\//g, "-")}.pdf`;
}

export { toRomanMonth };
