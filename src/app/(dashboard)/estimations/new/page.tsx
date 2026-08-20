import { notFound } from "next/navigation";
import { EstimationForm } from "@/components/estimation/EstimationForm";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function NewEstimationPage({
	searchParams,
}: {
	searchParams: Promise<{ proposal_id?: string }>;
}) {
	const { proposal_id } = await searchParams;
	if (!proposal_id) notFound();

	const supabase = await createClient();

	const [{ data: settingRows }, { data: existing }, { data: proposal }] = await Promise.all([
		supabase
			.from("system_settings")
			.select("key, value")
			.in("category", ["vehicle", "crew", "pricing", "packing", "safety"]),
		supabase
			.from("estimations")
			.select("id, inputs, overrides")
			.eq("proposal_id", proposal_id)
			.maybeSingle(),
		supabase.from("proposals").select("status").eq("id", proposal_id).maybeSingle(),
	]);

	// Estimations lock once the proposal leaves draft (invariant: proposals lock on
	// approval). This also makes the form view-only when reached from a job.
	const readOnly = proposal ? proposal.status !== "draft" : false;

	return (
		<div className="space-y-6">
			<PageHeader
				title={readOnly ? "Estimation" : existing ? "Edit Estimation" : "New Estimation"}
			/>
			<EstimationForm
				proposalId={proposal_id}
				readOnly={readOnly}
				settingRows={settingRows ?? []}
				existing={
					existing
						? {
								id: existing.id,
								inputs: existing.inputs as unknown as Parameters<
									typeof EstimationForm
								>[0]["existing"] extends undefined
									? never
									: NonNullable<Parameters<typeof EstimationForm>[0]["existing"]>["inputs"],
								overrides: existing.overrides as {
									final_price?: number;
									override_reason?: string;
								} | null,
							}
						: undefined
				}
			/>
		</div>
	);
}
