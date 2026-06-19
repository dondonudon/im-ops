"use server";
import { revalidatePath } from "next/cache";
import type { ProposalCustomFields } from "@/lib/proposalCustomFields";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

const ALLOWED_KEYS = new Set<string>(["price_suffix", "custom_conditions", "override_services"]);

function isValidCustomFields(fields: unknown): fields is ProposalCustomFields {
	if (!fields || typeof fields !== "object" || Array.isArray(fields)) return false;
	for (const [k, v] of Object.entries(fields)) {
		if (!ALLOWED_KEYS.has(k)) return false;
		if (v !== undefined && typeof v !== "string") return false;
	}
	return true;
}

export async function updateProposalCustomFields(proposalId: string, fields: ProposalCustomFields) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) throw new Error("Unauthorized");
	if (!isValidCustomFields(fields)) throw new Error("Invalid custom fields.");
	const { error } = await supabase
		.from("proposals")
		.update({ custom_fields: fields as Json })
		.eq("id", proposalId);
	if (error) throw new Error(error.message);
	revalidatePath(`/proposals/${proposalId}`);
}
