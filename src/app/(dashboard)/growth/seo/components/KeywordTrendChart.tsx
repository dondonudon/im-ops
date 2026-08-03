"use client";

import { useTranslations } from "next-intl";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui";
import type { TrendPoint } from "@/lib/search-console/queries";

export type KeywordTrendSeries = { keyword: string; points: TrendPoint[] };

const W = 720;
const H = 240;
const PAD = { left: 34, right: 16, top: 16, bottom: 26 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Round "nice" axis ticks (1/2/5 × 10ⁿ) across a numeric range. */
function niceTicks(min: number, max: number, target = 4): number[] {
	if (min === max) return [min];
	const step0 = (max - min) / target;
	const mag = 10 ** Math.floor(Math.log10(step0));
	const norm = step0 / mag;
	const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
	const ticks: number[] = [];
	for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
		ticks.push(Math.round(v * 10) / 10);
	}
	return ticks;
}

/**
 * Keyword position trend — inline SVG (no chart dependency). Y-axis is inverted
 * (rank 1 at the top) with labelled gridlines; the X-axis is dated; the latest
 * point is direct-labelled; hover shows a crosshair + tooltip. Gaps are not
 * plotted (never drawn as position 0). Single series → the selector names it,
 * so no legend; the line is brand-primary, all text uses ink tokens.
 */
export function KeywordTrendChart({ series }: { series: KeywordTrendSeries[] }) {
	const t = useTranslations("pages.seo.trend");
	const selectId = useId();
	const svgRef = useRef<SVGSVGElement>(null);
	const [selected, setSelected] = useState(series[0]?.keyword ?? "");
	const [hover, setHover] = useState<number | null>(null);

	const points = useMemo(
		() => series.find((s) => s.keyword === selected)?.points ?? [],
		[series, selected],
	);

	const dateFmt = useMemo(
		() => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }),
		[],
	);
	const numFmt = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }), []);
	const fmtDay = useCallback(
		(date: string) => dateFmt.format(new Date(`${date}T00:00:00`)),
		[dateFmt],
	);

	const geometry = useMemo(() => {
		if (points.length === 0) return null;
		const positions = points.map((p) => p.position);
		const days = points.map((p) => dayMs(p.date));
		const minP = Math.min(...positions);
		const maxP = Math.max(...positions);
		const pad = Math.max((maxP - minP) * 0.15, 0.5);
		const domainMin = Math.max(1, minP - pad); // rank can't be better than 1
		const domainMax = maxP + pad;
		const spanD = Math.max(...days) - Math.min(...days) || 1;
		const minD = Math.min(...days);

		// Inverted Y: best (low) rank near the top.
		const y = (pos: number) => PAD.top + ((pos - domainMin) / (domainMax - domainMin)) * INNER_H;
		const x = (date: string) =>
			points.length === 1
				? PAD.left + INNER_W / 2
				: PAD.left + ((dayMs(date) - minD) / spanD) * INNER_W;

		const coords = points.map((p) => ({ ...p, cx: x(p.date), cy: y(p.position) }));
		const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.cx},${c.cy}`).join(" ");

		const yTicks = niceTicks(domainMin, domainMax)
			.filter((v) => v >= domainMin && v <= domainMax)
			.map((v) => ({ v, y: y(v) }));
		const pageOneY = domainMin <= 10 && domainMax >= 10 ? y(10) : null;

		// ~5 evenly-spaced date ticks along the x range.
		const tickCount = Math.min(points.length, 5);
		const xTicks = Array.from({ length: tickCount }, (_, i) => {
			const idx = tickCount === 1 ? 0 : Math.round((i / (tickCount - 1)) * (points.length - 1));
			return { x: coords[idx].cx, label: fmtDay(points[idx].date) };
		});

		return { coords, line, yTicks, pageOneY, xTicks, last: coords[coords.length - 1] };
	}, [points, fmtDay]);

	const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
		const svg = svgRef.current;
		if (!svg || !geometry) return;
		const rect = svg.getBoundingClientRect();
		const xView = ((e.clientX - rect.left) / rect.width) * W;
		let best = 0;
		let bestDist = Number.POSITIVE_INFINITY;
		geometry.coords.forEach((c, i) => {
			const d = Math.abs(c.cx - xView);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		});
		setHover(best);
	};

	const hp = hover !== null && geometry ? geometry.coords[hover] : null;
	const tooltipLeft = hp ? Math.min(88, Math.max(12, (hp.cx / W) * 100)) : 0;

	return (
		<Card>
			<CardHeader
				title={t("title")}
				action={
					<label className="flex items-center gap-2 text-sm text-ink-muted" htmlFor={selectId}>
						<span className="sr-only">{t("selectLabel")}</span>
						<select
							id={selectId}
							value={selected}
							onChange={(e) => setSelected(e.target.value)}
							className="rounded-md border border-line bg-surface-raised px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
						>
							{series.map((s) => (
								<option key={s.keyword} value={s.keyword}>
									{s.keyword}
								</option>
							))}
						</select>
					</label>
				}
			/>
			<div className="p-5 pt-3">
				<p className="mb-2 text-xs text-ink-faint">{t("caption")}</p>
				{geometry === null ? (
					<p className="py-10 text-center text-sm text-ink-muted">{t("empty")}</p>
				) : (
					<div className="relative">
						<svg
							ref={svgRef}
							viewBox={`0 0 ${W} ${H}`}
							className="w-full h-auto"
							role="img"
							aria-label={`${t("title")}: ${selected}`}
							onMouseMove={onMove}
							onMouseLeave={() => setHover(null)}
						>
							<title>{`${t("title")}: ${selected}`}</title>

							{/* Y gridlines + rank labels */}
							{geometry.yTicks.map((tick) => (
								<g key={`y-${tick.v}`}>
									<line
										x1={PAD.left}
										x2={W - PAD.right}
										y1={tick.y}
										y2={tick.y}
										stroke="var(--border)"
									/>
									<text
										x={PAD.left - 6}
										y={tick.y}
										textAnchor="end"
										dominantBaseline="central"
										className="fill-ink-faint"
										fontSize="11"
									>
										{tick.v}
									</text>
								</g>
							))}

							{/* Page-one boundary emphasis */}
							{geometry.pageOneY !== null && (
								<>
									<line
										x1={PAD.left}
										x2={W - PAD.right}
										y1={geometry.pageOneY}
										y2={geometry.pageOneY}
										stroke="var(--border-strong)"
										strokeDasharray="4 3"
									/>
									<text
										x={W - PAD.right}
										y={geometry.pageOneY - 4}
										textAnchor="end"
										className="fill-ink-faint"
										fontSize="10"
									>
										{t("pageOne")}
									</text>
								</>
							)}

							{/* X date labels */}
							{geometry.xTicks.map((tick) => (
								<text
									key={`x-${tick.x}`}
									x={tick.x}
									y={H - 8}
									textAnchor="middle"
									className="fill-ink-faint"
									fontSize="11"
								>
									{tick.label}
								</text>
							))}

							{/* Series line + points */}
							<path d={geometry.line} fill="none" stroke="var(--primary)" strokeWidth={2} />
							{geometry.coords.map((c) => (
								<circle key={c.date} cx={c.cx} cy={c.cy} r={2.5} fill="var(--primary)" />
							))}

							{/* Direct label on the latest point */}
							<text
								x={geometry.last.cx - 6}
								y={geometry.last.cy - 8}
								textAnchor="end"
								className="fill-ink-muted"
								fontSize="11"
								fontWeight={600}
							>
								{geometry.last.position.toFixed(1)}
							</text>

							{/* Hover crosshair + focus point */}
							{hp && (
								<>
									<line
										x1={hp.cx}
										x2={hp.cx}
										y1={PAD.top}
										y2={H - PAD.bottom}
										stroke="var(--border-strong)"
									/>
									<circle
										cx={hp.cx}
										cy={hp.cy}
										r={5}
										fill="var(--primary)"
										stroke="var(--surface)"
										strokeWidth={2}
									/>
								</>
							)}
						</svg>

						{hp && (
							<div
								className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs shadow-token"
								style={{ left: `${tooltipLeft}%`, top: `${(hp.cy / H) * 100}%` }}
							>
								<p className="font-semibold text-ink">{fmtDay(hp.date)}</p>
								<p className="text-ink-muted">
									{t("position")}: <span className="text-ink">{hp.position.toFixed(1)}</span>
								</p>
								<p className="text-ink-muted">
									{t("clicks")}: <span className="text-ink">{numFmt.format(hp.clicks)}</span> ·{" "}
									{t("impressions")}:{" "}
									<span className="text-ink">{numFmt.format(hp.impressions)}</span>
								</p>
							</div>
						)}
					</div>
				)}
			</div>
		</Card>
	);
}
