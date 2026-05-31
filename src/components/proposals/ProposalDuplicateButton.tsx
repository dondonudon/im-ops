"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

/**
 * Re-quote a proposal: clones it as a fresh `draft` on the same lead,
 * with a new proposal number and the previous estimation snapshot copied across.
 * The original proposal remains untouched.
 */
export function ProposalDuplicateButton({
	proposalId,
	leadId,
	serviceType,
}: {
	proposalId: string;
	leadId: string;
	serviceType: string;
}) {
	const router = useRouter();
	const tButtons = useTranslations("common.buttons");
	const tConfirm = useTranslations("modals.confirmations");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleClick() {
		if (!window.confirm(tConfirm("duplicateProposal"))) return;
		setLoading(true);
		setError(null);
		try {
			const supabase = createClient();

			const { data: number } = await supabase.rpc("generate_proposal_number", {
				service_type: serviceType,
			});
			if (!number) throw new Error("Could not generate proposal number.");

			const {
				data: { user },
			} = await supabase.auth.getUser();

			const { data: newProposal, error: insertErr } = await supabase
				.from("proposals")
				.insert({
					lead_id: leadId,
					proposal_number: number,
					service_type: serviceType,
					status: "draft",
					created_by: user?.id ?? null,
				})
				.select("id")
				.single();
			if (insertErr || !newProposal) throw insertErr ?? new Error("Insert failed");

			const { data: srcEst } = await supabase
				.from("estimations")
				.select("engine_version, inputs, settings_snapshot, outputs, overrides")
				.eq("proposal_id", proposalId)
				.maybeSingle();

			if (srcEst) {
				await supabase.from("estimations").insert({
					proposal_id: newProposal.id,
					engine_version: srcEst.engine_version,
					inputs: srcEst.inputs,
					settings_snapshot: srcEst.settings_snapshot,
					outputs: srcEst.outputs,
					overrides: srcEst.overrides,
					created_by: user?.id ?? null,
				});

				const outputs = srcEst.outputs as { suggested_price?: number };
				const overrides = srcEst.overrides as { final_price?: number } | null;
				const finalPrice = overrides?.final_price ?? outputs?.suggested_price ?? null;
				if (finalPrice != null) {
					await supabase
						.from("proposals")
						.update({ final_price: finalPrice })
						.eq("id", newProposal.id);
				}
			}

			router.push(`/proposals/${newProposal.id}`);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Duplicate failed.");
			setLoading(false);
		}
	}

	return (
		<div>
			<button
				type="button"
				onClick={handleClick}
				disabled={loading}
				className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 shadow-sm transition-colors"
			>
				{loading ? (
					<Loader2 size={14} className="animate-spin" aria-hidden="true" />
				) : (
					<Copy size={14} aria-hidden="true" />
				)}
				{loading ? tButtons("duplicating") : tButtons("duplicate")}
			</button>
			{error && (
				<p role="alert" className="mt-1 text-xs text-red-600">
					{error}
				</p>
			)}
		</div>
	);
}
