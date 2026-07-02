import { notFound } from "next/navigation";
import { EditLeadForm } from "@/components/leads/EditLeadForm";
import { createClient } from "@/lib/supabase/server";

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();

	const { data: lead } = await supabase
		.from("leads")
		.select(`
      id, preferred_date, lead_type, origin_channel, notes,
      pickup_address, pickup_lat, pickup_lng,
      destination_address, destination_lat, destination_lng,
      destination_address_2, destination_2_lat, destination_2_lng,
      customers(name)
    `)
		.eq("id", id)
		.single();

	if (!lead) notFound();

	return (
		<EditLeadForm
			lead={{
				id: lead.id,
				customer_name: (lead.customers as { name: string } | null)?.name ?? "",
				preferred_date: lead.preferred_date ?? null,
				lead_type: lead.lead_type ?? "whatsapp",
				origin_channel: lead.origin_channel ?? "whatsapp",
				notes: lead.notes ?? null,
				pickup_address: lead.pickup_address ?? null,
				pickup_lat: (lead as Record<string, unknown>).pickup_lat as number | null,
				pickup_lng: (lead as Record<string, unknown>).pickup_lng as number | null,
				destination_address: lead.destination_address ?? null,
				destination_lat: (lead as Record<string, unknown>).destination_lat as number | null,
				destination_lng: (lead as Record<string, unknown>).destination_lng as number | null,
				destination_address_2: lead.destination_address_2 ?? null,
				destination_2_lat: (lead as Record<string, unknown>).destination_2_lat as number | null,
				destination_2_lng: (lead as Record<string, unknown>).destination_2_lng as number | null,
			}}
		/>
	);
}
