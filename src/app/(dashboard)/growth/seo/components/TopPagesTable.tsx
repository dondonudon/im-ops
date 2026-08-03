import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PageAggregate } from "@/lib/search-console/aggregate";

/** Strip the origin so pages show as paths; full value stays in a tooltip. */
function displayPath(page: string): string {
	try {
		if (/^https?:\/\//.test(page)) return new URL(page).pathname || "/";
	} catch {
		// keep as-is
	}
	return page;
}

export async function TopPagesTable({ pages }: { pages: PageAggregate[] }) {
	const t = await getTranslations("pages.seo.topPages");
	const locale = await getLocale();
	const int = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
	const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

	return (
		<Card>
			<CardHeader title={t("title")} />
			{pages.length === 0 ? (
				<div className="p-5">
					<EmptyState title={t("empty")} />
				</div>
			) : (
				<Table>
					<THead>
						<TH>{t("page")}</TH>
						<TH align="right">{t("clicks")}</TH>
						<TH align="right">{t("impressions")}</TH>
						<TH align="right">{t("ctr")}</TH>
						<TH align="right">{t("position")}</TH>
						<TH align="right">{t("queries")}</TH>
						<TH>{t("topQuery")}</TH>
					</THead>
					<TBody>
						{pages.map((p) => (
							<TR key={p.page}>
								<TD className="text-ink max-w-[16rem] truncate" title={p.page}>
									{displayPath(p.page)}
								</TD>
								<TD align="right">{int.format(p.clicks)}</TD>
								<TD align="right">{int.format(p.impressions)}</TD>
								<TD align="right">{pct.format(p.ctr)}</TD>
								<TD align="right">{p.position === null ? "—" : p.position.toFixed(1)}</TD>
								<TD align="right">{int.format(p.queryCount)}</TD>
								<TD className="text-ink-muted">{p.topQuery ?? "—"}</TD>
							</TR>
						))}
					</TBody>
				</Table>
			)}
		</Card>
	);
}
