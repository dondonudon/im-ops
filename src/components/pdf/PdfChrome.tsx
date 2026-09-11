/**
 * Shared PDF chrome — the header, footer, signature seal and status pill used by
 * every generated document (proposal / invoice / receipt). Previously each PDF
 * hand-rolled its own copy; this is the single source of truth.
 *
 * Every component takes `scale` (the fit-to-one-page factor, see pdfFit.ts) and
 * multiplies font sizes / vertical spacing by it, matching the per-document
 * `makeStyles(s)` convention.
 */
import { Link, Image as PdfImage, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PDF_COLOR, PDF_PAGE_PAD, PDF_TONE, type PdfTone } from "@/lib/pdf/theme";

export interface PdfCompany {
	name: string;
	tagline: string;
	address: string;
	phone: string;
	website: string;
	city: string;
	logo: string;
}

// ── Company header ──────────────────────────────────────────────────────────
export function CompanyHeader({ company, scale: s }: { company: PdfCompany; scale: number }) {
	const st = StyleSheet.create({
		row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
		logo: { width: 72 * s, height: 72 * s, objectFit: "contain" },
		nameFallback: { fontSize: 18 * s, fontWeight: 700, color: PDF_COLOR.brand },
		right: { flex: 1, alignItems: "flex-end", paddingLeft: 16 },
		tagline: {
			fontSize: 8 * s,
			fontWeight: 500,
			color: PDF_COLOR.ink,
			marginBottom: 2 * s,
			letterSpacing: 0.2,
		},
		contact: { fontSize: 7.5 * s, color: PDF_COLOR.inkMuted, textAlign: "right", lineHeight: 1.5 },
		rule: { height: 2, backgroundColor: PDF_COLOR.brand, marginTop: 9 * s, marginBottom: 16 * s },
	});
	const contactLine = [company.phone ? `Telp ${company.phone}` : "", company.website]
		.filter(Boolean)
		.join("  ·  ");
	return (
		<View>
			<View style={st.row}>
				{company.logo ? (
					<PdfImage src={company.logo} style={st.logo} />
				) : (
					<Text style={st.nameFallback}>{company.name}</Text>
				)}
				<View style={st.right}>
					{company.tagline ? <Text style={st.tagline}>{company.tagline}</Text> : null}
					{company.address ? <Text style={st.contact}>{company.address}</Text> : null}
					{contactLine ? <Text style={st.contact}>{contactLine}</Text> : null}
				</View>
			</View>
			<View style={st.rule} />
		</View>
	);
}

// ── Status pill ─────────────────────────────────────────────────────────────
export function StatusPill({
	label,
	tone,
	scale: s,
}: {
	label: string;
	tone: PdfTone;
	scale: number;
}) {
	const { bg, text } = PDF_TONE[tone];
	const st = StyleSheet.create({
		pill: {
			backgroundColor: bg,
			borderRadius: 3,
			paddingVertical: 2.5 * s,
			paddingHorizontal: 7 * s,
			alignSelf: "flex-start",
		},
		text: {
			fontSize: 7.5 * s,
			fontWeight: 700,
			color: text,
			letterSpacing: 0.6,
			textTransform: "uppercase",
		},
	});
	return (
		<View style={st.pill}>
			<Text style={st.text}>{label}</Text>
		</View>
	);
}

// ── Signature seal (with QR verification) ───────────────────────────────────
export function SignatureSeal({
	company,
	name,
	role,
	qrUrl,
	verifyUrl,
	scale: s,
	label = "Hormat kami,",
}: {
	company: PdfCompany;
	name: string;
	role: string;
	qrUrl: string;
	verifyUrl: string;
	scale: number;
	label?: string;
}) {
	const st = StyleSheet.create({
		row: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 * s },
		block: { width: 190, alignItems: "center" },
		label: { fontSize: 9 * s, color: PDF_COLOR.inkMuted, marginBottom: 1 },
		company: { fontSize: 9.5 * s, fontWeight: 700, color: PDF_COLOR.ink, marginBottom: 7 * s },
		qr: { width: 74 * s, height: 74 * s, marginBottom: 3 * s },
		qrLabel: {
			fontSize: 6.5 * s,
			color: PDF_COLOR.inkFaint,
			textAlign: "center",
			marginBottom: 7 * s,
		},
		name: {
			fontSize: 9.5 * s,
			fontWeight: 600,
			color: PDF_COLOR.ink,
			borderTopWidth: 0.75,
			borderTopColor: PDF_COLOR.lineStrong,
			paddingTop: 3 * s,
		},
		role: { fontSize: 8.5 * s, color: PDF_COLOR.inkMuted, marginTop: 1 },
	});
	return (
		<View style={st.row} wrap={false}>
			<View style={st.block} wrap={false}>
				<Text style={st.label}>{label}</Text>
				<Text style={st.company}>{company.name.toUpperCase()}</Text>
				{qrUrl ? (
					<>
						<Link src={verifyUrl}>
							<PdfImage src={qrUrl} style={st.qr} />
						</Link>
						<Text style={st.qrLabel}>Pindai untuk verifikasi</Text>
					</>
				) : null}
				<Text style={st.name}>{name}</Text>
				{role ? <Text style={st.role}>{role}</Text> : null}
			</View>
		</View>
	);
}

// ── Footer (fixed) ──────────────────────────────────────────────────────────
export function DocFooter({
	docNumber,
	website,
	scale: _s,
}: {
	docNumber: string;
	website: string;
	scale: number;
}) {
	const st = StyleSheet.create({
		footer: {
			position: "absolute",
			bottom: 16,
			left: PDF_PAGE_PAD,
			right: PDF_PAGE_PAD,
			paddingTop: 6,
			borderTopWidth: 0.5,
			borderTopColor: PDF_COLOR.line,
			flexDirection: "row",
			alignItems: "center",
		},
		docNumber: { flex: 1, fontSize: 7, color: PDF_COLOR.inkFaint, textAlign: "left" },
		website: {
			flex: 1,
			fontSize: 7.5,
			fontWeight: 500,
			color: PDF_COLOR.brand,
			textAlign: "center",
		},
		page: { flex: 1, fontSize: 7, color: PDF_COLOR.inkFaint, textAlign: "right" },
	});
	return (
		<View style={st.footer} fixed>
			<Text style={st.docNumber}>{docNumber}</Text>
			<Text style={st.website}>{website}</Text>
			<Text
				style={st.page}
				render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`}
			/>
		</View>
	);
}
