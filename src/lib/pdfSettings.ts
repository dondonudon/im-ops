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
}

/** Invoice-specific template content. */
export interface InvoiceTemplateSettings {
	bankName: string;
	bankAccountNumber: string;
	bankAccountHolder: string;
	signatureName: string;
	signatureRole: string;
}

const DEFAULTS: Record<string, string> = {
	company_name: "Indo Mover",
	company_tagline: "TRUCKING | MOVING | COURIER DOMESTIK & INTERNATIONAL",
	company_logo_url: "https://indo-mover.com/images/indo-mover-logo-only.png",
	company_address: "Jl. M.T. Haryono Gg. Utri 64 Semarang",
	company_phone: "+62 8515 600 9251",
	company_website: "https://www.indo-mover.com",
	company_city: "Semarang",
	proposal_included_services: "Packing\nLoading\nRelokasi",
	proposal_signature_name: "Prasetyo Eko Alvianto",
	proposal_signature_role: "Kepala Cabang",
	invoice_bank_name: "BANK BRI",
	invoice_bank_account_number: "089801008338503",
	invoice_bank_account_holder: "Prasetyo Eko Alvianto",
	invoice_signature_name: "Prasetyo Eko Alvianto",
	invoice_signature_role: "Kepala Cabang",
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
	};
}

/** Build invoice template settings from the raw key→value map. */
export function buildInvoiceTemplateSettings(map: Record<string, string>): InvoiceTemplateSettings {
	return {
		bankName: get(map, "invoice_bank_name"),
		bankAccountNumber: get(map, "invoice_bank_account_number"),
		bankAccountHolder: get(map, "invoice_bank_account_holder"),
		signatureName: get(map, "invoice_signature_name"),
		signatureRole: get(map, "invoice_signature_role"),
	};
}
