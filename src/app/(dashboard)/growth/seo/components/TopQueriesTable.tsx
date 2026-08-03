import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import type { QueryAggregate } from "@/lib/search-console/aggregate";
import { PositionChange } from "./PositionChange";

/** A top query with its position change vs the previous period. */
export type TopQuery = QueryAggregate & { positionDelta: number | null };

export async function TopQueriesTable({ queries }: { queries: TopQuery[] }) {
	const t = await getTranslations("pages.seo.topQueries");
	const locale = await getLocale();
	const int = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
	const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

	return (
		<Card>
			<CardHeader title={t("title")} />
			{queries.length === 0 ? (
				<div className="p-5">
					<EmptyState title={t("empty")} />
				</div>
			) : (
				<Table>
					<THead>
						<TH>{t("query")}</TH>
						<TH align="right">{t("clicks")}</TH>
						<TH align="right">{t("impressions")}</TH>
						<TH align="right">{t("ctr")}</TH>
						<TH align="right">{t("position")}</TH>
						<TH align="right">{t("change")}</TH>
					</THead>
					<TBody>
						{queries.map((q) => (
							<TR key={q.query}>
								<TD className="text-ink">{q.query}</TD>
								<TD align="right">{int.format(q.clicks)}</TD>
								<TD align="right">{int.format(q.impressions)}</TD>
								<TD align="right">{pct.format(q.ctr)}</TD>
								<TD align="right">{q.position === null ? "—" : q.position.toFixed(1)}</TD>
								<TD align="right">
									<PositionChange delta={q.positionDelta} />
								</TD>
							</TR>
						))}
					</TBody>
				</Table>
			)}
		</Card>
	);
}
