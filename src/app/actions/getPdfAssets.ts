"use server";

import { resolveLogoDataUrl } from "@/lib/pdfSettings";
import { createClient } from "@/lib/supabase/server";

export interface PdfAssets {
	logoDataUrl: string;
	verificationQrUrl: string;
	verificationUrl: string;
}

/**
 * Resolves the two heavy PDF assets — company logo (fetched + base64-encoded)
 * and a QR code (generated from the verification URL) — on demand when the user
 * clicks Download, not on every page load.
 *
 * Keeping this in a server action means the QRCode library stays server-side
 * and the base64 payload never bloats the RSC stream on page render.
 */
export async function getPdfAssets(logoUrl: string, verificationToken: string): Promise<PdfAssets> {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return { logoDataUrl: "", verificationQrUrl: "", verificationUrl: "" };

	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	const verificationUrl = `${appUrl}/verify/${verificationToken}`;

	const [logoDataUrl, { default: QRCode }] = await Promise.all([
		resolveLogoDataUrl(logoUrl),
		import("qrcode"),
	]);

	const verificationQrUrl = await QRCode.toDataURL(verificationUrl, { width: 160, margin: 1 });

	return { logoDataUrl, verificationQrUrl, verificationUrl };
}

/**
 * Logo-only variant for the job detail page (job PDFs don't have a verification
 * token; the receipt QR is generated client-side per payment).
 */
export async function getLogoAsset(logoUrl: string): Promise<string> {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return "";

	return resolveLogoDataUrl(logoUrl);
}
