import type { Tone } from "@/components/ui/Badge";

/**
 * Single source of truth: map any domain status → a semantic tone.
 * Consolidates the per-domain variant helpers in shared/StatusChip.tsx onto
 * the new token-backed Badge tones.
 */
const LEAD: Record<string, Tone> = {
	new: "info",
	survey_scheduled: "pending",
	survey_done: "pending",
	estimating: "pending",
	proposal_sent: "info",
	converted: "positive",
	closed_lost: "danger",
};

const PROPOSAL: Record<string, Tone> = {
	draft: "neutral",
	sent: "info",
	negotiating: "pending",
	approved: "positive",
	lost: "danger",
	expired: "pending",
};

const JOB: Record<string, Tone> = {
	scheduled: "info",
	in_progress: "pending",
	completed: "positive",
	closed: "neutral",
	cancelled: "danger",
};

const INVOICE: Record<string, Tone> = {
	sent: "info",
	partially_paid: "pending",
	paid: "positive",
	overdue: "danger",
	cancelled: "neutral",
};

export type Entity = "lead" | "proposal" | "job" | "invoice";

const MAPS: Record<Entity, Record<string, Tone>> = {
	lead: LEAD,
	proposal: PROPOSAL,
	job: JOB,
	invoice: INVOICE,
};

export function toneFor(entity: Entity, status: string): Tone {
	return MAPS[entity][status] ?? "neutral";
}
