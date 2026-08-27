// Helpers for the normalized `lead_addresses` child table (migration 010).
// A lead carries N pickups and N destinations, each a row: role + seq + address + coords.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type LeadAddressRole = "pickup" | "destination";

export interface LeadAddressRow {
	role: LeadAddressRole;
	seq: number;
	address: string | null;
	lat: number | null;
	lng: number | null;
}

export interface GroupedLeadAddresses {
	pickups: LeadAddressRow[];
	destinations: LeadAddressRow[];
}

/** Split raw child rows into ordered pickups + destinations (sorted by seq). */
export function groupLeadAddresses(
	rows: LeadAddressRow[] | null | undefined,
): GroupedLeadAddresses {
	const sorted = [...(rows ?? [])].sort((a, b) => a.seq - b.seq);
	return {
		pickups: sorted.filter((r) => r.role === "pickup"),
		destinations: sorted.filter((r) => r.role === "destination"),
	};
}

/** Ordered, non-empty address strings for a route line (pickups then destinations). */
export function routePoints(rows: LeadAddressRow[] | null | undefined): string[] {
	const { pickups, destinations } = groupLeadAddresses(rows);
	return [...pickups, ...destinations]
		.map((r) => r.address)
		.filter((a): a is string => Boolean(a?.trim()));
}

/** Delimiter used by the `leads.addresses_text` search cache (see migration 010). */
export const ADDRESSES_TEXT_DELIMITER = " | ";

/**
 * Ordered route points from the denormalized `leads.addresses_text` cache — for
 * list/card views that read the `leads_with_customer` view (where embedding the
 * child table isn't reliable). Order matches routePoints(): pickups then destinations.
 */
export function routePointsFromText(text: string | null | undefined): string[] {
	if (!text) return [];
	return text
		.split(ADDRESSES_TEXT_DELIMITER)
		.map((s) => s.trim())
		.filter(Boolean);
}

// --- write side ------------------------------------------------------------

/** A single address entry as captured by the form (LocationInput value shape). */
export interface AddressDraft {
	address: string;
	lat: number | null;
	lng: number | null;
}

type LeadAddressInsert = Database["public"]["Tables"]["lead_addresses"]["Insert"];

/** Build child rows from form drafts, dropping blanks and re-sequencing per role. */
export function buildLeadAddressRows(
	leadId: string,
	pickups: AddressDraft[],
	destinations: AddressDraft[],
): LeadAddressInsert[] {
	const rows: LeadAddressInsert[] = [];
	const push = (drafts: AddressDraft[], role: LeadAddressRole) => {
		let seq = 0;
		for (const d of drafts) {
			const address = d.address.trim();
			if (!address) continue;
			rows.push({ lead_id: leadId, role, seq, address, lat: d.lat, lng: d.lng });
			seq += 1;
		}
	};
	push(pickups, "pickup");
	push(destinations, "destination");
	return rows;
}

/**
 * Replace all address rows for a lead in one shot (delete-then-insert). Runs
 * client-side via PostgREST; the addresses_text search cache is kept in sync by
 * the `trg_lead_addresses_sync_text` DB trigger. Pass the same client the caller
 * already created.
 */
export async function replaceLeadAddresses(
	supabase: SupabaseClient<Database>,
	leadId: string,
	pickups: AddressDraft[],
	destinations: AddressDraft[],
): Promise<void> {
	const { error: delErr } = await supabase.from("lead_addresses").delete().eq("lead_id", leadId);
	if (delErr) throw delErr;
	const rows = buildLeadAddressRows(leadId, pickups, destinations);
	if (rows.length > 0) {
		const { error: insErr } = await supabase.from("lead_addresses").insert(rows);
		if (insErr) throw insErr;
	}
}
