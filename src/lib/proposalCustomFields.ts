export interface ProposalCustomFields {
	/** Appended after the formatted price, e.g. "/ trip" → "Rp 5.000.000 / trip" */
	price_suffix?: string;
	/** Extra payment clause rendered below the services list, e.g. "Minimum DP 50% sebelum hari H" */
	dp_note?: string;
	/** Free-form extra paragraph appended after dp_note */
	custom_conditions?: string;
	/** Newline-separated services list; when set, replaces the global proposal_included_services */
	override_services?: string;
}

export function parseCustomFields(raw: unknown): ProposalCustomFields {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	return raw as ProposalCustomFields;
}
