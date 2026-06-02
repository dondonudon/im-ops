import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * /estimations/[id] — resolves an estimation by id to its parent proposal
 * and redirects to the form (which detects the existing row and switches to edit mode).
 */
export default async function EstimationByIdPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();

	const { data } = await supabase
		.from("estimations")
		.select("proposal_id")
		.eq("id", id)
		.maybeSingle();

	if (!data?.proposal_id) notFound();

	redirect(`/estimations/new?proposal_id=${data.proposal_id}`);
}
