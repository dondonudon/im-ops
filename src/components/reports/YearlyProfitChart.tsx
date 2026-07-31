"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Card, CardHeader } from "@/components/ui";
import { formatRupiah } from "@/lib/utils";

export interface MonthProfitData {
	month: string; // "YYYY-MM"
	revenue: number;
	expenses: number;
	profit: number;
	isFuture: boolean;
	isSelected: boolean;
}

interface Props {
	data: MonthProfitData[];
	year: number;
}

const BAR_W = 8;
const GAP = 14;
const X_PAD = 6;
// 6 + 8*12 + 14*11 + 6 = 262
const CHART_W = X_PAD + BAR_W * 12 + GAP * 11 + X_PAD;
const PAD_TOP = 6;
const PAD_BOT = 18;
const CHART_AREA_H = 52;
const CHART_H = PAD_TOP + CHART_AREA_H + PAD_BOT;

// Bar path: rounded at the data-end, square at the baseline (per mark spec)
function barPath(
	x: number,
	zeroY: number,
	barH: number,
	barW: number,
	isPositive: boolean,
): string {
	const r = Math.min(1.5, barH * 0.4);
	if (r < 0.3 || barH < 0.5) {
		const y = isPositive ? zeroY - barH : zeroY;
		return `M${x},${y}h${barW}v${Math.max(barH, 1)}h${-barW}Z`;
	}
	if (isPositive) {
		const topY = zeroY - barH;
		return `M${x},${zeroY} L${x},${topY + r} Q${x},${topY} ${x + r},${topY} L${x + barW - r},${topY} Q${x + barW},${topY} ${x + barW},${topY + r} L${x + barW},${zeroY} Z`;
	}
	const botY = zeroY + barH;
	return `M${x},${zeroY} L${x + barW},${zeroY} L${x + barW},${botY - r} Q${x + barW},${botY} ${x + barW - r},${botY} L${x + r},${botY} Q${x},${botY} ${x},${botY - r} Z`;
}

export function YearlyProfitChart({ data, year }: Props) {
	const t = useTranslations("pages.reports");
	const locale = useLocale();
	const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

	const selectedIdx = data.findIndex((d) => d.isSelected);
	const activeIdx = hoveredIdx ?? (selectedIdx >= 0 ? selectedIdx : 0);
	const active = data[activeIdx];

	// Dynamic zero line: position proportional to max positive vs negative
	const maxPositive = Math.max(...data.map((d) => (d.profit > 0 ? d.profit : 0)), 0);
	const maxNegative = Math.max(...data.map((d) => (d.profit < 0 ? -d.profit : 0)), 0);
	const totalRange = maxPositive + maxNegative;
	const zeroY =
		totalRange > 0 ? PAD_TOP + (CHART_AREA_H * maxPositive) / totalRange : PAD_TOP + CHART_AREA_H;
	const scale = totalRange > 0 ? CHART_AREA_H / totalRange : 0;

	const activeMonthLabel = active
		? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
				new Date(`${active.month}-01`),
			)
		: "";

	return (
		<Card>
			<CardHeader title={t("yearlyProfit.title", { year })} />
			<div className="px-5 pb-4 pt-3">
				{/* Detail panel — shows selected or hovered month; no tooltip needed */}
				{active && (
					<div className="flex flex-wrap items-end gap-x-6 gap-y-1 mb-3">
						<div>
							<p className="text-[10px] text-ink-faint uppercase tracking-wide mb-0.5">
								{activeMonthLabel}
							</p>
							<p
								className={`text-xl font-bold ${
									active.profit >= 0 ? "text-success" : "text-danger"
								}`}
							>
								{formatRupiah(active.profit)}
							</p>
						</div>
						{!active.isFuture && (
							<div className="flex gap-4 pb-0.5">
								<div>
									<p className="text-[10px] text-ink-faint uppercase tracking-wide">
										{t("profitByJob.revenue")}
									</p>
									<p className="text-sm font-semibold tabular-nums text-ink">
										{formatRupiah(active.revenue)}
									</p>
								</div>
								<div>
									<p className="text-[10px] text-ink-faint uppercase tracking-wide">
										{t("profitByJob.cost")}
									</p>
									<p className="text-sm font-semibold tabular-nums text-danger">
										{formatRupiah(active.expenses)}
									</p>
								</div>
							</div>
						)}
					</div>
				)}

				{/* SVG bar chart — single series, so no legend box (title names it) */}
				<svg
					viewBox={`0 0 ${CHART_W} ${CHART_H}`}
					className="w-full"
					role="img"
					aria-label={`Monthly profit chart for ${year}`}
					style={{ display: "block" }}
				>
					{/* Zero baseline — solid hairline, non-scaling so it stays 1px at all widths */}
					<line
						x1={0}
						y1={zeroY}
						x2={CHART_W}
						y2={zeroY}
						stroke="currentColor"
						strokeOpacity={0.15}
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>

					{data.map((d, i) => {
						const x = X_PAD + i * (BAR_W + GAP);
						const barH = Math.abs(d.profit) * scale;
						const clampedH = d.profit !== 0 ? Math.max(barH, 1.5) : 0;
						const isPositive = d.profit >= 0;
						const isActive = activeIdx === i;

						// Status colors (good/bad encoding); future months de-emphasized
						const fill = d.isFuture
							? "currentColor"
							: isPositive
								? "var(--success)"
								: "var(--danger)";
						const opacity = d.isFuture ? 0.12 : isActive ? 1 : 0.5;

						const labelText = new Intl.DateTimeFormat(locale, { month: "short" }).format(
							new Date(`${d.month}-01`),
						);

						return (
							// biome-ignore lint/a11y/useSemanticElements: SVG <g> cannot be replaced with <button>
							<g
								key={d.month}
								onMouseEnter={() => setHoveredIdx(i)}
								onMouseLeave={() => setHoveredIdx(null)}
								onFocus={() => setHoveredIdx(i)}
								onBlur={() => setHoveredIdx(null)}
								role="button"
								tabIndex={0}
								aria-label={`${labelText}: ${formatRupiah(d.profit)}`}
								style={{ cursor: "pointer" }}
							>
								{/* Hit area — full slot width (bar + gap) for ≥24px touch target */}
								<rect
									x={x - GAP / 2}
									y={PAD_TOP}
									width={BAR_W + GAP}
									height={CHART_AREA_H}
									fill="transparent"
								/>
								{/* Bar — path gives rounded data-end, square at baseline */}
								{clampedH > 0 && (
									<path
										d={barPath(x, zeroY, clampedH, BAR_W, isPositive)}
										fill={fill}
										opacity={opacity}
									/>
								)}
								{/* Active indicator dot */}
								{isActive && (
									<circle
										cx={x + BAR_W / 2}
										cy={CHART_H - PAD_BOT + 6}
										r={1.5}
										fill={fill}
										opacity={d.isFuture ? 0.25 : 0.5}
									/>
								)}
								{/* Month label — text uses ink token, not series color */}
								<text
									x={x + BAR_W / 2}
									y={CHART_H - 2}
									textAnchor="middle"
									fontSize={5.5}
									fill="currentColor"
									fillOpacity={isActive ? 0.7 : 0.3}
									fontFamily="inherit"
									fontWeight={isActive ? "600" : "400"}
								>
									{labelText}
								</text>
							</g>
						);
					})}
				</svg>
			</div>
		</Card>
	);
}
