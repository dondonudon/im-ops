/**
 * Shared design tokens + font registration for all generated PDFs
 * (proposal, invoice, receipt).
 *
 * react-pdf can't read the app's CSS custom properties, so this is a parallel,
 * hardcoded palette that mirrors the semantic-token philosophy used in the app
 * UI. Keep the two in visual sync when the brand changes.
 */

import { Font } from "@react-pdf/renderer";

/** Page horizontal padding (pt). Footer left/right must match this. */
export const PDF_PAGE_PAD = 46;

/** Semantic PDF palette. Brand = the logo's deep maroon. */
export const PDF_COLOR = {
	brand: "#8A1E2D",
	brandDark: "#6E1723",
	brandTint: "#F6EBED",
	ink: "#1F2430",
	inkMuted: "#5B6270",
	inkFaint: "#98A0AD",
	line: "#E3E6EB",
	lineStrong: "#C8CDD6",
	surface: "#FFFFFF",
	surfaceSunken: "#F5F6F8",
	successText: "#1C7A46",
	successBg: "#E6F4EC",
	dangerText: "#B23A3A",
	dangerBg: "#FBECEC",
	warnText: "#8A6100",
	warnBg: "#FBF2DC",
	white: "#FFFFFF",
} as const;

export type PdfTone = "brand" | "success" | "danger" | "warn" | "neutral";

/** Background / text pair for a status pill by tone. */
export const PDF_TONE: Record<PdfTone, { bg: string; text: string }> = {
	brand: { bg: PDF_COLOR.brandTint, text: PDF_COLOR.brand },
	success: { bg: PDF_COLOR.successBg, text: PDF_COLOR.successText },
	danger: { bg: PDF_COLOR.dangerBg, text: PDF_COLOR.dangerText },
	warn: { bg: PDF_COLOR.warnBg, text: PDF_COLOR.warnText },
	neutral: { bg: PDF_COLOR.surfaceSunken, text: PDF_COLOR.inkMuted },
};

let _registered = false;

/**
 * Registers the Inter family (self-hosted TTFs in /public/fonts) + disables
 * hyphenation. Idempotent — safe to call at the top of every PDF module.
 * react-pdf fetches the TTFs at render time via same-origin `fetch` (allowed by
 * the app CSP's `connect-src 'self'`).
 */
export function registerPdfFonts() {
	if (_registered) return;
	_registered = true;
	// Browser: same-origin "/fonts". Node scripts/tests can point at a real
	// filesystem dir via PDF_FONT_BASE (fontkit reads local paths there).
	const base = process.env.PDF_FONT_BASE ?? "/fonts";
	Font.register({
		family: "Inter",
		fonts: [
			{ src: `${base}/Inter-Regular.ttf`, fontWeight: 400 },
			{ src: `${base}/Inter-Medium.ttf`, fontWeight: 500 },
			{ src: `${base}/Inter-SemiBold.ttf`, fontWeight: 600 },
			{ src: `${base}/Inter-Bold.ttf`, fontWeight: 700 },
			{ src: `${base}/Inter-Italic.ttf`, fontWeight: 400, fontStyle: "italic" },
		],
	});
	Font.registerHyphenationCallback((word) => [word]);
}
