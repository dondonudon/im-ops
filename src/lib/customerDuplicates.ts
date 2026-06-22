export type CustomerDuplicate = {
	id: string;
	prefix: string | null;
	name: string;
	phone: string | null;
};

function normalizeName(value: string | null | undefined): string {
	return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(value: string | null | undefined): string {
	// Strip all non-digits first
	const digits = (value ?? "").replace(/\D/g, "");
	// +62 / 62 prefix → 0  (e.g. 6285647272844 → 085647272844)
	if (digits.startsWith("62") && digits.length > 4) {
		return `0${digits.slice(2)}`;
	}
	// bare subscriber number starting with 8 → add 0  (e.g. 85647272844 → 085647272844)
	if (digits.startsWith("8") && digits.length >= 9) {
		return `0${digits}`;
	}
	return digits;
}

export function formatCustomerLabel(
	customer: Pick<CustomerDuplicate, "prefix" | "name" | "phone">,
): string {
	const name = customer.prefix ? `${customer.prefix}. ${customer.name}` : customer.name;
	return customer.phone ? `${name} (${customer.phone})` : name;
}

export function findDuplicateCustomer(
	customers: CustomerDuplicate[],
	input: { name: string; phone?: string | null },
): CustomerDuplicate | null {
	const normalizedPhone = normalizePhone(input.phone);
	if (normalizedPhone) {
		return customers.find((customer) => normalizePhone(customer.phone) === normalizedPhone) ?? null;
	}

	const normalizedName = normalizeName(input.name);
	if (!normalizedName) return null;

	return customers.find((customer) => normalizeName(customer.name) === normalizedName) ?? null;
}
