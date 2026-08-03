import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, CardHeader, type Tone } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import type { OpportunityPriority, SeoOpportunity } from "@/lib/search-console/opportunities";

const PRIORITY_TONE: Record<OpportunityPriority, Tone> = {
	high: "danger",
	medium: "pending",
	low: "neutral",
};

function displayPath(page: string | undefined): string {
	if (!page) return "—";
	try {
		if (/^https?:\/\//.test(page)) return new URL(page).pathname || "/";
	} catch {
		// keep as-is
	}
	return page;
}

export async function SeoOpportunityTable({ opportunities }: { opportunities: SeoOpportunity[] }) {
	const t = await getTranslations("pages.seo.opportunities");
	const locale = await getLocale();
	const int = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
	const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

	// Literal-key lookups (kept type-safe; no dynamic keys).
	const priorityLabel: Record<OpportunityPriority, string> = {
		high: t("priority.high"),
		medium: t("priority.medium"),
		low: t("priority.low"),
	};
	const typeLabel = {
		near_page_one: t("near_page_one.label"),
		low_ctr: t("low_ctr.label"),
		unexpected_page: t("unexpected_page.label"),
		cannibalization: t("cannibalization.label"),
		declining_keyword: t("declining_keyword.label"),
	} as const;
	const recommendation = {
		near_page_one: t("near_page_one.recommendation"),
		low_ctr: t("low_ctr.recommendation"),
		unexpected_page: t("unexpected_page.recommendation"),
		cannibalization: t("cannibalization.recommendation"),
		declining_keyword: t("declining_keyword.recommendation"),
	} as const;

	const evidence = (o: SeoOpportunity): string => {
		const m = o.metrics;
		const args = {
			position: m.position != null ? m.position.toFixed(1) : "—",
			impressions: m.impressions != null ? int.format(m.impressions) : "—",
			ctr: m.ctr != null ? pct.format(m.ctr) : "—",
			delta: m.delta != null ? m.delta.toFixed(1) : "—",
			share: m.share != null ? pct.format(m.share) : "—",
			otherShare: m.otherShare != null ? pct.format(m.otherShare) : "—",
			page: displayPath(o.page),
			otherPage: displayPath(m.otherPage),
			targetPage: m.targetPage ?? "—",
		};
		switch (o.type) {
			case "near_page_one":
				return t("near_page_one.evidence", args);
			case "low_ctr":
				return t("low_ctr.evidence", args);
			case "unexpected_page":
				return t("unexpected_page.evidence", args);
			case "cannibalization":
				return t("cannibalization.evidence", args);
			case "declining_keyword":
				return t("declining_keyword.evidence", args);
		}
	};

	return (
		<Card>
			<CardHeader title={t("title")} />
			{opportunities.length === 0 ? (
				<div className="p-5">
					<EmptyState title={t("empty")} />
				</div>
			) : (
				<ul className="divide-y divide-line">
					{opportunities.map((o) => (
						<li key={`${o.type}-${o.query}`} className="p-5 flex items-start gap-3">
							<Badge tone={PRIORITY_TONE[o.priority]}>{priorityLabel[o.priority]}</Badge>
							<div className="space-y-0.5">
								<p className="text-sm font-semibold text-ink">
									{typeLabel[o.type]} —{" "}
									<span className="font-normal text-ink-muted">{o.query}</span>
								</p>
								<p className="text-sm text-ink-muted">{evidence(o)}</p>
								<p className="text-sm text-ink-faint">{recommendation[o.type]}</p>
							</div>
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}
