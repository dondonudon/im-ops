import { getLocale, getTranslations } from "next-intl/server";
import {
	Badge,
	Card,
	CardHeader,
	Table,
	TBody,
	TD,
	TH,
	THead,
	type Tone,
	TR,
} from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { type KeywordStatusBand, keywordStatusBand } from "@/lib/search-console/metrics";
import type { TargetKeywordMetric } from "@/lib/search-console/queries";
import { PositionChange } from "./PositionChange";

const BAND_TONE: Record<KeywordStatusBand, Tone> = {
	top3: "positive",
	page1: "positive",
	nearPage1: "pending",
	needsWork: "neutral",
	noData: "neutral",
};

export async function TargetKeywordTable({ metrics }: { metrics: TargetKeywordMetric[] }) {
	const t = await getTranslations("pages.seo.keywords");
	const tStatus = await getTranslations("pages.seo.status");
	const locale = await getLocale();

	const int = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
	const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

	return (
		<Card>
			<CardHeader title={t("title")} />
			{metrics.length === 0 ? (
				<div className="p-5">
					<EmptyState title={t("empty")} />
				</div>
			) : (
				<Table>
					<THead>
						<TH>{t("keyword")}</TH>
						<TH>{t("targetPage")}</TH>
						<TH align="right">{t("clicks")}</TH>
						<TH align="right">{t("impressions")}</TH>
						<TH align="right">{t("ctr")}</TH>
						<TH align="right">{t("position")}</TH>
						<TH align="right">{t("change")}</TH>
						<TH>{t("status")}</TH>
					</THead>
					<TBody>
						{metrics.map((m) => {
							const band = keywordStatusBand(m.current.position);
							return (
								<TR key={m.keyword}>
									<TD className="font-medium text-ink">{m.keyword}</TD>
									<TD className="text-ink-muted">{m.targetPage ?? "—"}</TD>
									<TD align="right">{int.format(m.current.clicks)}</TD>
									<TD align="right">{int.format(m.current.impressions)}</TD>
									<TD align="right">{pct.format(m.current.ctr)}</TD>
									<TD align="right">
										{m.current.position === null ? "—" : m.current.position.toFixed(1)}
									</TD>
									<TD align="right">
										<PositionChange delta={m.positionDelta} />
									</TD>
									<TD>
										<Badge tone={BAND_TONE[band]}>{tStatus(band)}</Badge>
									</TD>
								</TR>
							);
						})}
					</TBody>
				</Table>
			)}
		</Card>
	);
}
