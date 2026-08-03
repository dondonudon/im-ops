import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import {
	aggregateByPage,
	aggregateByQuery,
	queryPageDistribution,
} from "@/lib/search-console/aggregate";
import { isRangePreset, resolveDashboardRange } from "@/lib/search-console/dates";
import { positionDelta, summarize } from "@/lib/search-console/metrics";
import { detectOpportunities } from "@/lib/search-console/opportunities";
import {
	getActiveProperty,
	getKeywordTrend,
	getLatestSeoSync,
	getPageQueryRows,
	getQueryRows,
	getTargetKeywordMetrics,
	getTargetKeywords,
} from "@/lib/search-console/queries";
import { createClient } from "@/lib/supabase/server";
import { todayInJakarta } from "@/lib/utils";
import { KeywordTrendChart } from "./components/KeywordTrendChart";
import { RefreshButton } from "./components/RefreshButton";
import { SeoDateRange } from "./components/SeoDateRange";
import { SeoOpportunityTable } from "./components/SeoOpportunityTable";
import { SeoSummaryCards } from "./components/SeoSummaryCards";
import { SeoSyncStatus } from "./components/SeoSyncStatus";
import { TargetKeywordTable } from "./components/TargetKeywordTable";
import { TopPagesTable } from "./components/TopPagesTable";
import { TopQueriesTable } from "./components/TopQueriesTable";

const TOP_QUERIES_LIMIT = 25;
const TOP_PAGES_LIMIT = 10;
const byImpressions = <T extends { impressions: number }>(a: T, b: T) =>
	b.impressions - a.impressions;

export default async function SeoDashboardPage({
	searchParams,
}: {
	searchParams: Promise<{ range?: string }>;
}) {
	const { range } = await searchParams;
	const preset = isRangePreset(range) ? range : "28d";
	const window = resolveDashboardRange(preset, todayInJakarta());

	const supabase = await createClient();
	const t = await getTranslations("pages.seo");
	const property = await getActiveProperty(supabase);

	if (!property) {
		return (
			<div className="space-y-8">
				<PageHeader title={t("title")} />
				<EmptyState title={t("empty.noProperty")} />
			</div>
		);
	}

	const keywords = await getTargetKeywords(supabase, property.id);
	const [
		queryRowsCurrent,
		queryRowsPrevious,
		pageQueryRows,
		keywordMetrics,
		latestSync,
		trendSeries,
	] = await Promise.all([
		getQueryRows(supabase, property.id, window.current),
		getQueryRows(supabase, property.id, window.previous),
		getPageQueryRows(supabase, property.id, window.current),
		getTargetKeywordMetrics(supabase, property.id, keywords, window.current, window.previous),
		getLatestSeoSync(supabase, property.id),
		Promise.all(
			keywords.map(async (k) => ({
				keyword: k.keyword,
				points: await getKeywordTrend(supabase, property.id, k.keyword, window.current),
			})),
		),
	]);

	const currentSummary = summarize(queryRowsCurrent);
	const previousSummary = summarize(queryRowsPrevious);

	const queryAggregates = aggregateByQuery(queryRowsCurrent);
	const previousPositionByQuery = new Map(
		aggregateByQuery(queryRowsPrevious).map((q) => [q.query, q.position]),
	);
	const topQueries = [...queryAggregates]
		.sort(byImpressions)
		.slice(0, TOP_QUERIES_LIMIT)
		.map((q) => ({
			...q,
			positionDelta: positionDelta(previousPositionByQuery.get(q.query) ?? null, q.position),
		}));

	const topPages = aggregateByPage(pageQueryRows).sort(byImpressions).slice(0, TOP_PAGES_LIMIT);

	const opportunities = detectOpportunities({
		queryAggregates,
		queryPageShares: queryPageDistribution(pageQueryRows),
		targetKeywords: keywords.map((k) => ({ keyword: k.keyword, targetPage: k.target_page })),
		currentPositionByKeyword: new Map(keywordMetrics.map((m) => [m.keyword, m.current.position])),
		previousPositionByKeyword: new Map(keywordMetrics.map((m) => [m.keyword, m.previous.position])),
	});

	const domain = property.site_url.replace(/^sc-domain:/, "");

	return (
		<div className="space-y-8">
			<PageHeader
				title={t("title")}
				subtitle={t("subtitle", { site: domain })}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<SeoDateRange current={preset} />
						<RefreshButton />
					</div>
				}
			/>
			<SeoSummaryCards current={currentSummary} previous={previousSummary} />
			<TargetKeywordTable metrics={keywordMetrics} />
			{keywords.length > 0 && <KeywordTrendChart series={trendSeries} />}
			<TopQueriesTable queries={topQueries} />
			<TopPagesTable pages={topPages} />
			<SeoOpportunityTable opportunities={opportunities} />
			<SeoSyncStatus sync={latestSync} />
		</div>
	);
}
