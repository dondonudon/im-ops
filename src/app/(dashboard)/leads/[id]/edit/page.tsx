import { notFound } from "next/navigation";
import { EditLeadForm } from "@/components/leads/EditLeadForm";
import { groupLeadAddresses, type LeadAddressRow } from "@/lib/leadAddresses";
import { createClient } from "@/lib/supabase/server";

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();

	const { data: lead } = await supabase
		.from("leads")
		.select(`
      id, preferred_date, lead_type, origin_channel, notes,
      lead_addresses(role, seq, address, lat, lng),
      customers(name)
    `)
		.eq("id", id)
		.single();

	if (!lead) notFound();

	const { pickups, destinations } = groupLeadAddresses(
		(lead.lead_addresses as LeadAddressRow[] | null) ?? [],
	);
	const toValue = (r: LeadAddressRow) => ({ address: r.address ?? "", lat: r.lat, lng: r.lng });

	return (
		<EditLeadForm
			lead={{
				id: lead.id,
				customer_name: (lead.customers as { name: string } | null)?.name ?? "",
				preferred_date: lead.preferred_date ?? null,
				lead_type: lead.lead_type ?? "whatsapp",
				origin_channel: lead.origin_channel ?? "whatsapp",
				notes: lead.notes ?? null,
				pickups: pickups.map(toValue),
				destinations: destinations.map(toValue),
			}}
		/>
	);
}
