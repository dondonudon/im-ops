/**
 * Helpers to derive typed PDF settings from the flat system_settings key→value map.
 */

import { validateOutboundUrl } from "@/lib/security/ssrf";

/** Company identity — appears on every PDF. */
export interface CompanySettings {
	name: string;
	tagline: string;
	address: string;
	phone: string;
	website: string;
	city: string;
	logo: string;
}

/** Proposal-specific template content. */
export interface ProposalTemplateSettings {
	/** Newline-separated list of included services, e.g. "Packing\nLoading\nRelokasi" */
	includedServices: string[];
	signatureName: string;
	signatureRole: string;
	/** Base64 data URL of the QR code. Generated server-side from the proposal's verification_token. */
	verificationQrUrl: string;
	/** Verification page URL encoded by the QR code. Used as the clickable link target in the PDF. */
	verificationUrl: string;
}

/** Invoice-specific template content. */
export interface InvoiceTemplateSettings {
	bankName: string;
	bankAccountNumber: string;
	bankAccountHolder: string;
	signatureName: string;
	signatureRole: string;
	/** Base64 data URL of the QR code. Generated server-side from the invoice's verification_token. */
	verificationQrUrl: string;
	/** Verification page URL encoded by the QR code. Used as the clickable link target in the PDF. */
	verificationUrl: string;
}

/** Receipt-specific template content. verificationQrUrl generated client-side per payment. */
export interface ReceiptTemplateSettings {
	signatureName: string;
	signatureRole: string;
	/** Base64 data URL of the QR code. Generated client-side in PaymentReceiptDownloadButton. */
	verificationQrUrl: string;
	/** Verification page URL encoded by the QR code. Used as the clickable link target in the PDF. */
	verificationUrl: string;
}

const DEFAULTS: Record<string, string> = {
	company_name: "",
	company_tagline: "",
	company_logo_url: "",
	company_address: "",
	company_phone: "",
	company_website: "",
	company_city: "",
	proposal_included_services: "",
	proposal_signature_name: "",
	proposal_signature_role: "",
	invoice_bank_name: "",
	invoice_bank_account_number: "",
	invoice_bank_account_holder: "",
	invoice_signature_name: "",
	invoice_signature_role: "",
};

function get(map: Record<string, string>, key: string): string {
	return map[key] ?? DEFAULTS[key] ?? "";
}

/** Build company identity settings from the raw key→value map. */
export function buildCompanySettings(map: Record<string, string>): CompanySettings {
	return {
		name: get(map, "company_name"),
		tagline: get(map, "company_tagline"),
		address: get(map, "company_address"),
		phone: get(map, "company_phone"),
		website: get(map, "company_website"),
		city: get(map, "company_city"),
		logo: get(map, "company_logo_url"),
	};
}

/** Build proposal template settings from the raw key→value map. */
export function buildProposalTemplateSettings(
	map: Record<string, string>,
): ProposalTemplateSettings {
	const raw = get(map, "proposal_included_services");
	return {
		includedServices: raw
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean),
		signatureName: get(map, "proposal_signature_name"),
		signatureRole: get(map, "proposal_signature_role"),
		verificationQrUrl: "", // filled in by download button
		verificationUrl: "", // filled in by download button
	};
}

/** Max bytes we'll inline into a PDF as base64 (guards against huge/hostile responses). */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Fetches a remote image URL and returns a base64 data URL.
 * Call this server-side only — it uses Node fetch with no CORS/CSP constraints.
 * The URL comes from operator-controlled settings, so we still guard against SSRF:
 * https-only, non-private hosts, a request timeout, and a response size cap.
 * Falls back to the original URL (or empty string) on any error.
 */
async function resolveImageDataUrl(url: string, cacheTag?: string): Promise<string> {
	if (!url) return "";
	if (url.startsWith("data:")) return url;

	// SSRF guard: https + non-private host only. (No host allowlist — a logo may
	// legitimately live on Supabase storage or an arbitrary CDN.)
	const safeUrl = validateOutboundUrl(url);
	if (!safeUrl) return url;

	try {
		const opts = cacheTag
			? { next: { revalidate: 3600, tags: [cacheTag] }, signal: AbortSignal.timeout(5000) }
			: { cache: "no-store" as RequestCache, signal: AbortSignal.timeout(5000) };
		const res = await fetch(safeUrl, opts);
		if (!res.ok) return url;

		const contentType = res.headers.get("content-type") ?? "";
		if (contentType && !contentType.startsWith("image/")) return url;

		const declaredLength = Number(res.headers.get("content-length") ?? "0");
		if (declaredLength > MAX_IMAGE_BYTES) return url;

		const buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.byteLength > MAX_IMAGE_BYTES) return url;

		const mime = contentType || "image/png";
		return `data:${mime};base64,${buffer.toString("base64")}`;
	} catch {
		return url;
	}
}

/**
 * Fetches a remote logo URL and returns a base64 data URL.
 * Call this server-side only.
 */
export async function resolveLogoDataUrl(url: string): Promise<string> {
	return resolveImageDataUrl(url, "system-settings");
}

/** Build invoice template settings from the raw key→value map. */
export function buildInvoiceTemplateSettings(map: Record<string, string>): InvoiceTemplateSettings {
	return {
		bankName: get(map, "invoice_bank_name"),
		bankAccountNumber: get(map, "invoice_bank_account_number"),
		bankAccountHolder: get(map, "invoice_bank_account_holder"),
		signatureName: get(map, "invoice_signature_name"),
		signatureRole: get(map, "invoice_signature_role"),
		verificationQrUrl: "", // filled in by download button
		verificationUrl: "", // filled in by download button
	};
}
