/**
 * Pure SEO opportunity detection. These are decision-support SIGNALS, not
 * verdicts — thresholds are conservative and every finding carries the evidence
 * (metrics) that triggered it. No I/O; unit-tested.
 *
 * Output is structured (type + metrics), and the UI formats the evidence /
 * recommendation text via i18n so nothing is hard-coded here.
 */

import type { QueryAggregate, QueryPageShare } from "./aggregate";

export type OpportunityType =
	| "near_page_one"
	| "low_ctr"
	| "unexpected_page"
	| "cannibalization"
	| "declining_keyword";

export type OpportunityPriority = "high" | "medium" | "low";

export type SeoOpportunity = {
	type: OpportunityType;
	priority: OpportunityPriority;
	query: string;
	page?: string;
	/** Numbers behind the signal, surfaced as evidence in the UI. */
	metrics: {
		position?: number;
		impressions?: number;
		ctr?: number;
		delta?: number;
		share?: number;
		otherPage?: string;
		otherShare?: number;
		targetPage?: string;
	};
};

export type OpportunityThresholds = {
	nearMinImpressions: number;
	lowCtrMinImpressions: number;
	lowCtrMax: number;
	cannibalMinImpressions: number;
	cannibalMinShare: number;
	unexpectedMinImpressions: number;
	decliningMinDrop: number;
	decliningMinImpressions: number;
};

export const DEFAULT_THRESHOLDS: OpportunityThresholds = {
	nearMinImpressions: 20,
	lowCtrMinImpressions: 50,
	lowCtrMax: 0.03,
	cannibalMinImpressions: 30,
	cannibalMinShare: 0.2,
	unexpectedMinImpressions: 20,
	decliningMinDrop: 3,
	decliningMinImpressions: 20,
};

const PRIORITY_ORDER: Record<OpportunityPriority, number> = { high: 0, medium: 1, low: 2 };

export type OpportunityInputs = {
	/** Current-window query rollups. */
	queryAggregates: QueryAggregate[];
	/** Current-window per-query page distribution. */
	queryPageShares: QueryPageShare[];
	/** Target keywords with their configured page. */
	targetKeywords: Array<{ keyword: string; targetPage: string | null }>;
	/** keyword → previous-window weighted position (for decline detection). */
	previousPositionByKeyword: Map<string, number | null>;
	/** keyword → current-window weighted position. */
	currentPositionByKeyword: Map<string, number | null>;
	thresholds?: Partial<OpportunityThresholds>;
};

export function detectOpportunities(inputs: OpportunityInputs): SeoOpportunity[] {
	const t = { ...DEFAULT_THRESHOLDS, ...inputs.thresholds };
	const out: SeoOpportunity[] = [];

	// Near page one — position 10–20 with real impressions.
	for (const q of inputs.queryAggregates) {
		if (
			q.position !== null &&
			q.position > 10 &&
			q.position <= 20 &&
			q.impressions >= t.nearMinImpressions
		) {
			out.push({
				type: "near_page_one",
				priority: "high",
				query: q.query,
				metrics: { position: q.position, impressions: q.impressions },
			});
		}
	}

	// Low CTR — ranking on page one but under-clicked (heuristic).
	for (const q of inputs.queryAggregates) {
		if (
			q.position !== null &&
			q.position <= 10 &&
			q.impressions >= t.lowCtrMinImpressions &&
			q.ctr < t.lowCtrMax
		) {
			out.push({
				type: "low_ctr",
				priority: "medium",
				query: q.query,
				metrics: { position: q.position, impressions: q.impressions, ctr: q.ctr },
			});
		}
	}

	// Unexpected ranking page — a target keyword ranks mainly on a non-target page.
	const shareByQuery = new Map(inputs.queryPageShares.map((s) => [s.query, s]));
	for (const k of inputs.targetKeywords) {
		if (!k.targetPage) continue;
		const share = shareByQuery.get(k.keyword);
		const dominant = share?.pages[0];
		if (!dominant || share.totalImpressions < t.unexpectedMinImpressions) continue;
		if (!samePage(dominant.page, k.targetPage)) {
			out.push({
				type: "unexpected_page",
				priority: "medium",
				query: k.keyword,
				page: dominant.page,
				metrics: {
					impressions: dominant.impressions,
					share: dominant.share,
					targetPage: k.targetPage,
				},
			});
		}
	}

	// Cannibalization — one query split across ≥2 pages, each with a real share.
	for (const s of inputs.queryPageShares) {
		if (s.totalImpressions < t.cannibalMinImpressions) continue;
		const strong = s.pages.filter((p) => p.share >= t.cannibalMinShare);
		if (strong.length >= 2) {
			out.push({
				type: "cannibalization",
				priority: "low",
				query: s.query,
				page: strong[0].page,
				metrics: {
					share: strong[0].share,
					otherPage: strong[1].page,
					otherShare: strong[1].share,
					impressions: s.totalImpressions,
				},
			});
		}
	}

	// Declining keyword — target keyword whose position dropped ≥ N points.
	for (const k of inputs.targetKeywords) {
		const prev = inputs.previousPositionByKeyword.get(k.keyword) ?? null;
		const cur = inputs.currentPositionByKeyword.get(k.keyword) ?? null;
		if (prev === null || cur === null) continue;
		const drop = cur - prev; // positive = worse (rank increased)
		const curAgg = inputs.queryAggregates.find((q) => q.query === k.keyword);
		const impressions = curAgg?.impressions ?? 0;
		if (drop >= t.decliningMinDrop && impressions >= t.decliningMinImpressions) {
			out.push({
				type: "declining_keyword",
				priority: "medium",
				query: k.keyword,
				metrics: { delta: drop, position: cur, impressions },
			});
		}
	}

	return out.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

/** Normalize path/URL forms so "/" and "https://site/" compare equal-ish. */
function samePage(a: string, b: string): boolean {
	return normalizePath(a) === normalizePath(b);
}

function normalizePath(page: string): string {
	let path = page;
	try {
		if (/^https?:\/\//.test(page)) path = new URL(page).pathname;
	} catch {
		// keep as-is
	}
	if (path.length > 1) path = path.replace(/\/$/, ""); // drop trailing slash except root
	return path;
}
