"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

/**
 * Duplicates a lead into a fresh "new"-status row tied to the same customer.
 * Use case: re-quote a previously closed_lost lead without re-typing addresses.
 */
export function LeadDuplicateButton({ leadId }: { leadId: string }) {
	const router = useRouter();
	const tButtons = useTranslations("common.buttons");
	const tConfirm = useTranslations("modals.confirmations");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleClick() {
		if (!window.confirm(tConfirm("duplicateLead"))) return;
		setLoading(true);
		setError(null);
		try {
			const supabase = createClient();
			const { data: source, error: fetchErr } = await supabase
				.from("leads")
				.select(
					"customer_id, pickup_address, destination_address, preferred_date, lead_type, origin_channel, notes",
				)
				.eq("id", leadId)
				.single();
			if (fetchErr || !source) throw fetchErr ?? new Error("Lead not found");

			const {
				data: { user },
			} = await supabase.auth.getUser();

			const { data: created, error: insertErr } = await supabase
				.from("leads")
				.insert({
					customer_id: source.customer_id!,
					pickup_address: source.pickup_address,
					destination_address: source.destination_address,
					preferred_date: source.preferred_date,
					lead_type: source.lead_type,
					origin_channel: source.origin_channel,
					notes: source.notes,
					status: "new",
					created_by: user?.id ?? null,
				})
				.select("id")
				.single();
			if (insertErr || !created) throw insertErr ?? new Error("Insert failed");

			router.push(`/leads/${created.id}`);
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
