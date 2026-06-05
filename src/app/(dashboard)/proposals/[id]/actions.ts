"use server";
import { revalidatePath } from "next/cache";
import type { ProposalCustomFields } from "@/lib/proposalCustomFields";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export async function updateProposalCustomFields(proposalId: string, fields: ProposalCustomFields) {
	const supabase = await createClient();
	const { error } = await supabase
		.from("proposals")
		.update({ custom_fields: fields as Json })
		.eq("id", proposalId);
	if (error) throw new Error(error.message);
	revalidatePath(`/proposals/${proposalId}`);
}
