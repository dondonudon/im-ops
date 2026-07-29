/**
 * Helpers to derive typed PDF settings from the flat system_settings key→value map.
 */

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
	/** Base64 data URL of the drawn signature image. Resolved server-side before PDF render. */
	signatureImageUrl: string;
	/** Base64 data URL of the QR code. Generated server-side from the proposal's verification_token. */
	verificationQrUrl: string;
}

/** Invoice-specific template content. */
export interface InvoiceTemplateSettings {
	bankName: string;
	bankAccountNumber: string;
	bankAccountHolder: string;
	signatureName: string;
	signatureRole: string;
	/** Base64 data URL of the drawn signature image. Resolved server-side before PDF render. */
	signatureImageUrl: string;
	/** Base64 data URL of the QR code. Generated server-side from the invoice's verification_token. */
	verificationQrUrl: string;
}

/** Receipt-specific template content. verificationQrUrl generated client-side per payment. */
export interface ReceiptTemplateSettings {
	signatureName: string;
	signatureRole: string;
	/** Base64 data URL of the drawn signature image. Resolved server-side, passed through props. */
	signatureImageUrl: string;
	/** Base64 data URL of the QR code. Generated client-side in PaymentReceiptDownloadButton. */
	verificationQrUrl: string;
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
	proposal_signature_image_url: "",
	invoice_bank_name: "",
	invoice_bank_account_number: "",
	invoice_bank_account_holder: "",
	invoice_signature_name: "",
	invoice_signature_role: "",
	invoice_signature_image_url: "",
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
		signatureImageUrl: get(map, "proposal_signature_image_url"),
		verificationQrUrl: "", // filled in by page after QR generation
	};
}

/**
 * Fetches a remote image URL and returns a base64 data URL.
 * Call this server-side only — it uses Node fetch with no CORS/CSP constraints.
 * Falls back to the original URL (or empty string) on any error.
 */
async function resolveImageDataUrl(url: string, cacheTag?: string): Promise<string> {
	if (!url) return "";
	if (url.startsWith("data:")) return url;
	try {
		const opts = cacheTag
			? { next: { revalidate: 3600, tags: [cacheTag] } }
			: { cache: "no-store" as RequestCache };
		const res = await fetch(url, opts);
		if (!res.ok) return url;
		const mime = res.headers.get("content-type") ?? "image/png";
		const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
		return `data:${mime};base64,${base64}`;
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

/**
 * Fetches a remote signature image URL and returns a base64 data URL.
 * Call this server-side only.
 */
export async function resolveSignatureDataUrl(url: string): Promise<string> {
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
		signatureImageUrl: get(map, "invoice_signature_image_url"),
		verificationQrUrl: "", // filled in by page after QR generation
	};
}
