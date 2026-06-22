"use server";

import { createClient } from "@/lib/supabase/server";
import type { CustomerDuplicate } from "@/lib/customerDuplicates";

function normalizePhone(value: string | null | undefined): string {
	const digits = (value ?? "").replace(/\D/g, "");
	if (digits.startsWith("62") && digits.length > 4) return `0${digits.slice(2)}`;
	if (digits.startsWith("8") && digits.length >= 9) return `0${digits}`;
	return digits;
}

function normalizeName(value: string | null | undefined): string {
	return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Server-side duplicate customer check.
 * Queries only the rows that could be a duplicate (by phone or name),
 * rather than loading the full customers table into the browser.
 */
export async function checkDuplicateCustomer(input: {
	name: string;
	phone?: string | null;
}): Promise<CustomerDuplicate | null> {
	const supabase = await createClient();

	const normalizedPhone = normalizePhone(input.phone);
	const normalizedName = normalizeName(input.name);

	if (!normalizedPhone && !normalizedName) return null;

	// Build a filter that matches either phone or name candidates
	const filters: string[] = [];
	if (normalizedPhone) filters.push(`phone.eq.${normalizedPhone}`);
	if (normalizedName) filters.push(`name.ilike.${normalizedName}`);

	const { data, error } = await supabase
		.from("customers")
		.select("id, prefix, name, phone")
		.or(filters.join(","))
		.limit(10);

	if (error || !data) return null;

	// Re-apply the same normalization logic used in findDuplicateCustomer
	if (normalizedPhone) {
		return data.find((c) => normalizePhone(c.phone) === normalizedPhone) ?? null;
	}
	return data.find((c) => normalizeName(c.name) === normalizedName) ?? null;
}
