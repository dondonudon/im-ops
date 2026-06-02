"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type Stage = "new" | "survey" | "estimate" | "proposal" | "won";

export type AdvanceResult =
	| { ok: true; status: string }
	| {
			ok: false;
			reason: "needs_survey" | "needs_proposal" | "needs_job" | "error";
	  };

/**
 * Move a lead between pipeline stages via drag-and-drop, ENFORCING the data
 * invariants (status is app-managed, not DB-enforced):
 *   - proposal_sent ⇔ a non-terminal proposal exists
 *   - converted     ⇔ a job exists
 * Illegal moves are rejected with a reason so the UI can snap the card back.
 * The one allowed side effect — dropping into Estimate with no proposal yet —
 * mirrors the existing "skip to estimate" flow (auto-creates a draft proposal).
 */
export async function advanceLead(
	leadId: string,
	toStage: Stage,
): Promise<AdvanceResult> {
	const supabase = await createClient();

	const { data: { user } } = await supabase.auth.getUser();
	if (!user) return { ok: false, reason: "error" };

	const { data: lead, error: leadErr } = await supabase
		.from("leads")
		.select("id, status")
		.eq("id", leadId)
		.single();
	if (leadErr || !lead) return { ok: false, reason: "error" };

	const { data: proposalsData } = await supabase
		.from("proposals")
		.select("id, status")
		.eq("lead_id", leadId);
	const proposals = proposalsData ?? [];
	const proposalIds = proposals.map((p) => p.id);
	const hasNonTerminalProposal = proposals.some((p) =>
		["draft", "sent", "negotiating", "approved"].includes(p.status),
	);

	let jobCount = 0;
	if (proposalIds.length > 0) {
		const { count } = await supabase
			.from("jobs")
			.select("*", { count: "exact", head: true })
			.in("proposal_id", proposalIds);
		jobCount = count ?? 0;
	}

	let newStatus:
		| "new"
		| "survey_scheduled"
		| "estimating"
		| "proposal_sent"
		| "converted";
	switch (toStage) {
		case "new":
			newStatus = "new";
			break;

		case "survey": {
			// Scheduling a survey needs a date/time, so it can't be created from a
			// drop. Only allow this stage if a survey record already exists.
			const { count: surveyCount } = await supabase
				.from("surveys")
				.select("*", { count: "exact", head: true })
				.eq("lead_id", leadId);
			if (!surveyCount) return { ok: false, reason: "needs_survey" };
			newStatus = "survey_scheduled";
			break;
		}

		case "estimate": {
			// Ensure a draft proposal exists (create one if not) — same as the
			// lead panel's "skip to estimate".
			if (proposals.length === 0) {
				const { data: proposalNumber } = await supabase.rpc(
					"generate_proposal_number",
					{ service_type: "DOM" },
				);
				const { error: insErr } = await supabase.from("proposals").insert({
					lead_id: leadId,
					proposal_number: proposalNumber!,
					service_type: "DOM",
					status: "draft",
				});
				if (insErr) return { ok: false, reason: "error" };
			}
			newStatus = "estimating";
			break;
		}

		case "proposal": {
			if (!hasNonTerminalProposal)
				return { ok: false, reason: "needs_proposal" };
			newStatus = "proposal_sent";
			break;
		}

		case "won": {
			if (jobCount === 0) return { ok: false, reason: "needs_job" };
			newStatus = "converted";
			break;
		}

		default:
			return { ok: false, reason: "error" };
	}

	const { error: updErr } = await supabase
		.from("leads")
		.update({ status: newStatus })
		.eq("id", leadId);
	if (updErr) return { ok: false, reason: "error" };

	revalidatePath("/pipeline");
	revalidatePath("/today");
	return { ok: true, status: newStatus };
}
