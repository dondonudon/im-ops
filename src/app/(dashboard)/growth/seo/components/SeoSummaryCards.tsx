import { Eye, Gauge, MousePointerClick, Percent } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Stat, type Tone } from "@/components/ui";
import { percentChange, positionDelta, type SeoSummary } from "@/lib/search-console/metrics";

type Props = { current: SeoSummary; previous: SeoSummary };

/** KPI cards: current-period value + comparison against the previous period. */
export async function SeoSummaryCards({ current, previous }: Props) {
	const t = await getTranslations("pages.seo.kpi");
	const locale = await getLocale();

	const int = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
	const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
	const signedPct = new Intl.NumberFormat(locale, {
		style: "percent",
		maximumFractionDigits: 1,
		signDisplay: "exceptZero",
	});

	// Comparison for a magnitude metric (clicks / impressions / CTR).
	const magnitudeDelta = (cur: number, prev: number): { text: string; tone: Tone } => {
		const change = percentChange(cur, prev);
		if (change === null) return { text: t("new"), tone: "positive" };
		if (change === 0) return { text: t("noChange"), tone: "neutral" };
		return {
			text: `${signedPct.format(change)} ${t("vsPrevious")}`,
			tone: change > 0 ? "positive" : "danger",
		};
	};

	const clicks = magnitudeDelta(current.clicks, previous.clicks);
	const impressions = magnitudeDelta(current.impressions, previous.impressions);
	const ctr = magnitudeDelta(current.ctr, previous.ctr);

	// Position is a point delta (lower rank is better), shown as points not %.
	const posDelta = positionDelta(previous.position, current.position);
	const position: { text: string; tone: Tone } =
		posDelta === null || current.position === null
			? { text: t("noData"), tone: "neutral" }
			: Math.abs(posDelta) < 0.05
				? { text: t("noChange"), tone: "neutral" }
				: posDelta > 0
					? { text: t("improvedBy", { value: Math.abs(posDelta).toFixed(1) }), tone: "positive" }
					: { text: t("declinedBy", { value: Math.abs(posDelta).toFixed(1) }), tone: "danger" };

	return (
		<section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
			<Stat
				icon={<MousePointerClick size={16} />}
				label={t("clicks")}
				value={int.format(current.clicks)}
				sub={clicks.text}
				tone={clicks.tone}
			/>
			<Stat
				icon={<Eye size={16} />}
				label={t("impressions")}
				value={int.format(current.impressions)}
				sub={impressions.text}
				tone={impressions.tone}
			/>
			<Stat
				icon={<Percent size={16} />}
				label={t("ctr")}
				value={pct.format(current.ctr)}
				sub={ctr.text}
				tone={ctr.tone}
			/>
			<Stat
				icon={<Gauge size={16} />}
				label={t("position")}
				value={current.position === null ? t("noData") : current.position.toFixed(1)}
				sub={position.text}
				tone={position.tone}
			/>
		</section>
	);
}
