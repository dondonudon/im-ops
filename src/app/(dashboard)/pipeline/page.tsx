import { CircleSlash } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Stage } from "@/app/(dashboard)/pipeline/actions";
import {
	type ColumnsData,
	PipelineBoard,
	type PipelineCard,
} from "@/components/pipeline/PipelineBoard";
import { EmptyState, Money, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

/** Map a lead status to its funnel column. `closed_lost` is excluded. */
function stageOf(status: string): Stage | null {
	switch (status) {
		case "new":
			return "new";
		case "survey_scheduled":
		case "survey_done":
			return "survey";
		case "estimating":
			return "estimate";
		case "proposal_sent":
			return "proposal";
		case "converted":
			return "won";
		default:
			return null;
	}
}

type LeadRow = {
	id: string;
	status: string;
	pickup_address: string | null;
	destination_address: string | null;
	destination_address_2: string | null;
	preferred_date: string | null;
	created_at: string;
	customers: { name: string; type: string } | null;
	proposals: { final_price: number | null; status: string }[];
};

/** Best-known value for a deal: approved proposal price, else any priced proposal. */
function dealValue(proposals: LeadRow["proposals"]): number {
	const approved = proposals.find((p) => p.status === "approved" && p.final_price != null);
	if (approved?.final_price != null) return approved.final_price;
	const priced = proposals.find((p) => p.final_price != null);
	return priced?.final_price ?? 0;
}

/**
 * PIPELINE — the deal funnel as one drag-and-drop board. Each lead is a card
 * that flows through stages; dragging it advances the lead's status via a
 * server action that enforces the data invariants.
 */
export default async function PipelinePage() {
	const t = await getTranslations("pipeline");
	const supabase = await createClient();

	const [{ data: leadsData }, { count: lostCount }] = await Promise.all([
		(() => {
			const cutoff = new Date();
			cutoff.setMonth(cutoff.getMonth() - 18);
			return supabase
				.from("leads")
				.select(
					"id, status, pickup_address, destination_address, destination_address_2, preferred_date, created_at, customers(name, type), proposals(final_price, status)",
				)
				.neq("status", "closed_lost")
				.gte("created_at", cutoff.toISOString())
				.order("created_at", { ascending: false })
				.limit(500);
		})(),
		supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "closed_lost"),
	]);

	const leads = (leadsData ?? []) as LeadRow[];

	const columns: ColumnsData = {
		new: [],
		survey: [],
		estimate: [],
		proposal: [],
		won: [],
	};
	for (const lead of leads) {
		const stage = stageOf(lead.status);
		if (!stage) continue;
		const card: PipelineCard = {
			id: lead.id,
			status: lead.status,
			customerName: lead.customers?.name ?? "—",
			pickup: lead.pickup_address,
			destination: lead.destination_address,
			destination2: lead.destination_address_2,
			dateLabel: formatDate(lead.preferred_date ?? lead.created_at),
			value: dealValue(lead.proposals),
		};
		columns[stage].push(card);
	}

	const totalValue = leads.reduce((s, l) => s + dealValue(l.proposals), 0);

	return (
		<div className="space-y-5">
			<PageHeader
				title={t("title")}
				subtitle={t("subtitle", { count: leads.length })}
				actions={
					(lostCount ?? 0) > 0 ? (
						<Link
							href="/leads?status=closed_lost"
							className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink"
						>
							<CircleSlash size={13} />
							{t("lostCount", { count: lostCount ?? 0 })}
						</Link>
					) : undefined
				}
			/>

			{leads.length === 0 ? (
				<EmptyState title={t("empty")} hint={t("emptyHint")} />
			) : (
				<PipelineBoard initialColumns={columns} />
			)}

			{totalValue > 0 && (
				<div className="flex items-center justify-end gap-2 text-sm text-ink-muted">
					<span>{t("pipelineValue")}</span>
					<Money value={totalValue} className="font-bold text-ink" />
				</div>
			)}
		</div>
	);
}
