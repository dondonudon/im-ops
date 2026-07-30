"use client";

import { ExternalLink, ZoomIn } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LightboxPhoto, PhotoLightbox } from "@/components/shared/PhotoLightbox";
import { Card } from "@/components/ui";
import { batchSignedUrls, type UrlCache } from "@/lib/storage/signedUrls";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

type LeadPhoto = {
	id: string;
	storage_path: string;
	caption: string | null;
};

type SpecialItem = {
	type: string;
	qty: number;
	note: string;
};

type SurveyMediaRow = {
	id: string;
	storage_path: string;
	caption: string | null;
	media_type: string;
};

type SurveyRow = {
	id: string;
	special_items: SpecialItem[];
	access_notes: string | null;
	notes: string | null;
	conducted_at: string | null;
	survey_media: SurveyMediaRow[];
};

const GRID_CLASSES = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2";
const TILE_CLASSES = "relative group rounded-lg overflow-hidden aspect-square bg-subtle";

export function LeadSurveyReferencePanel({
	leadId,
	leadPhotos,
	surveys,
}: {
	leadId: string;
	leadPhotos: LeadPhoto[];
	surveys: SurveyRow[];
}) {
	const t = useTranslations("panels.intakeReference");
	const supabase = useMemo(() => createClient(), []);

	// Signed URLs for lead photos
	const [leadPhotoUrls, setLeadPhotoUrls] = useState<Map<string, string>>(new Map());
	const urlCache = useRef<UrlCache>(new Map());
	const [showAllLeadPhotos, setShowAllLeadPhotos] = useState(false);
	const [leadLightboxIdx, setLeadLightboxIdx] = useState<number | null>(null);

	// Primary survey: completed one first, otherwise most recent
	const primarySurvey = useMemo(
		() => surveys.find((s) => s.conducted_at) ?? surveys[0] ?? null,
		[surveys],
	);
	const specialItems: SpecialItem[] = useMemo(
		() =>
			Array.isArray(primarySurvey?.special_items)
				? (primarySurvey!.special_items as SpecialItem[])
				: [],
		[primarySurvey],
	);
	const surveyPhotos = useMemo(
		() => (primarySurvey?.survey_media ?? []).filter((m) => m.media_type === "photo"),
		[primarySurvey],
	);
	const [showAllSurveyPhotos, setShowAllSurveyPhotos] = useState(false);
	const [surveyLightboxIdx, setSurveyLightboxIdx] = useState<number | null>(null);

	// Signed URLs for survey photos — the bucket is private (no public URLs).
	// Uses a separate cache ref keyed with a "survey:" prefix to avoid collisions
	// with the lead-photos cache (same urlCache ref, different bucket).
	const [surveyPhotoUrls, setSurveyPhotoUrls] = useState<Map<string, string>>(new Map());
	const surveyUrlCache = useRef<UrlCache>(new Map());
	useEffect(() => {
		if (surveyPhotos.length === 0) return;
		let cancelled = false;
		async function refresh() {
			const map = await batchSignedUrls(
				supabase,
				"survey-media",
				surveyPhotos.map((m) => m.storage_path),
				surveyUrlCache.current,
			);
			if (!cancelled) setSurveyPhotoUrls(map);
		}
		refresh();
		return () => {
			cancelled = true;
		};
	}, [surveyPhotos, supabase]);

	// Fetch signed URLs for lead photos
	useEffect(() => {
		if (leadPhotos.length === 0) return;
		let cancelled = false;
		async function refresh() {
			const map = await batchSignedUrls(
				supabase,
				"lead-photos",
				leadPhotos.map((p) => p.storage_path),
				urlCache.current,
			);
			if (!cancelled) setLeadPhotoUrls(map);
		}
		refresh();
		return () => {
			cancelled = true;
		};
	}, [leadPhotos, supabase]);

	const hasContent = leadPhotos.length > 0 || surveys.length > 0;
	const visibleLeadPhotos = showAllLeadPhotos ? leadPhotos : leadPhotos.slice(0, 8);
	const visibleSurveyPhotos = showAllSurveyPhotos ? surveyPhotos : surveyPhotos.slice(0, 8);

	return (
		<Card className="p-5 space-y-5">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
					{t("title")}
				</h2>
				<Link
					href={`/leads/${leadId}`}
					className="flex items-center gap-1 text-xs text-primary-text hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded transition-opacity"
				>
					{t("viewLead")}
					<ExternalLink size={11} aria-hidden="true" />
				</Link>
			</div>

			{!hasContent ? (
				<p className="text-sm text-ink-faint text-center py-4">{t("empty")}</p>
			) : (
				<>
					{/* Lead intake photos */}
					{leadPhotos.length > 0 && (
						<section className="space-y-2.5">
							<h3 className="text-xs font-medium text-ink-muted">
								{t("leadPhotos", { count: leadPhotos.length })}
							</h3>
							<ul
								className={GRID_CLASSES}
								aria-label={t("leadPhotos", { count: leadPhotos.length })}
							>
								{visibleLeadPhotos.map((photo) => {
									const idx = leadPhotos.indexOf(photo);
									const url = leadPhotoUrls.get(photo.storage_path);
									return (
										<li key={photo.id} className={TILE_CLASSES}>
											{url ? (
												<Image
													src={url}
													alt={photo.caption ?? t("photoAlt")}
													fill
													sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
													className="object-cover transition-transform duration-200 group-hover:scale-105"
												/>
											) : (
												<div className="absolute inset-0 animate-pulse bg-subtle" />
											)}
											<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
											<button
												type="button"
												onClick={() => setLeadLightboxIdx(idx)}
												className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
												aria-label={t("viewPhoto", { n: idx + 1, total: leadPhotos.length })}
											>
												<ZoomIn
													size={20}
													className="text-white drop-shadow-lg"
													aria-hidden="true"
												/>
											</button>
										</li>
									);
								})}
							</ul>
							{leadPhotos.length > 8 && (
								<button
									type="button"
									onClick={() => setShowAllLeadPhotos((v) => !v)}
									className="w-full text-xs font-medium text-ink-muted hover:text-ink transition-colors py-1"
								>
									{showAllLeadPhotos
										? t("showLess")
										: t("showMore", { count: leadPhotos.length - 8 })}
								</button>
							)}
						</section>
					)}

					{/* Survey section */}
					{primarySurvey && (
						<section
							className={`space-y-3${leadPhotos.length > 0 ? " border-t border-line pt-4" : ""}`}
						>
							<h3 className="text-xs font-medium text-ink-muted">
								{t("surveySection")}
								{primarySurvey.conducted_at && (
									<span className="ml-1.5 font-normal text-ink-faint">
										· {t("surveyConducted", { date: formatDate(primarySurvey.conducted_at) })}
									</span>
								)}
							</h3>

							{/* Special items */}
							{specialItems.length > 0 ? (
								<ul className="space-y-1.5" aria-label={t("specialItems")}>
									{specialItems.map((item, i) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: special items have no stable id; order-only render
										<li key={i} className="flex items-baseline gap-2 text-sm">
											<span className="shrink-0 text-xs font-mono bg-surface-raised rounded px-1.5 py-0.5 text-ink-muted tabular-nums">
												×{item.qty}
											</span>
											<span className="font-medium text-ink">{item.type}</span>
											{item.note && <span className="text-ink-faint text-xs">— {item.note}</span>}
										</li>
									))}
								</ul>
							) : (
								<p className="text-sm text-ink-faint">{t("noSpecialItems")}</p>
							)}

							{/* Survey photos */}
							{surveyPhotos.length > 0 && (
								<div className="space-y-2 pt-1">
									<p className="text-xs text-ink-faint">
										{t("surveyPhotos", { count: surveyPhotos.length })}
									</p>
									<ul
										className={GRID_CLASSES}
										aria-label={t("surveyPhotos", { count: surveyPhotos.length })}
									>
										{visibleSurveyPhotos.map((m) => {
											const idx = surveyPhotos.indexOf(m);
											const url = surveyPhotoUrls.get(m.storage_path);
											return (
												<li key={m.id} className={TILE_CLASSES}>
													{url && (
														<Image
															src={url}
															alt={m.caption ?? t("photoAlt")}
															fill
															sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
															className="object-cover transition-transform duration-200 group-hover:scale-105"
														/>
													)}
													<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
													<button
														type="button"
														onClick={() => setSurveyLightboxIdx(idx)}
														className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
														aria-label={t("viewPhoto", { n: idx + 1, total: surveyPhotos.length })}
													>
														<ZoomIn
															size={20}
															className="text-white drop-shadow-lg"
															aria-hidden="true"
														/>
													</button>
												</li>
											);
										})}
									</ul>
									{surveyPhotos.length > 8 && (
										<button
											type="button"
											onClick={() => setShowAllSurveyPhotos((v) => !v)}
											className="w-full text-xs font-medium text-ink-muted hover:text-ink transition-colors py-1"
										>
											{showAllSurveyPhotos
												? t("showLess")
												: t("showMore", { count: surveyPhotos.length - 8 })}
										</button>
									)}
								</div>
							)}
						</section>
					)}
				</>
			)}

			{/* Lead photos lightbox */}
			{leadLightboxIdx !== null && (
				<PhotoLightbox
					photos={leadPhotos
						.map(
							(p): LightboxPhoto => ({
								src: leadPhotoUrls.get(p.storage_path) ?? "",
								alt: p.caption ?? t("photoAlt"),
								caption: p.caption,
							}),
						)
						.filter((p) => p.src !== "")}
					index={leadLightboxIdx}
					onClose={() => setLeadLightboxIdx(null)}
					onPrev={() => setLeadLightboxIdx((i) => Math.max(0, (i ?? 0) - 1))}
					onNext={() => setLeadLightboxIdx((i) => Math.min(leadPhotos.length - 1, (i ?? 0) + 1))}
				/>
			)}

			{/* Survey photos lightbox */}
			{surveyLightboxIdx !== null && (
				<PhotoLightbox
					photos={surveyPhotos
						.map(
							(m): LightboxPhoto => ({
								src: surveyPhotoUrls.get(m.storage_path) ?? "",
								alt: m.caption ?? t("photoAlt"),
								caption: m.caption,
							}),
						)
						.filter((p) => p.src !== "")}
					index={surveyLightboxIdx}
					onClose={() => setSurveyLightboxIdx(null)}
					onPrev={() => setSurveyLightboxIdx((i) => Math.max(0, (i ?? 0) - 1))}
					onNext={() =>
						setSurveyLightboxIdx((i) => Math.min(surveyPhotos.length - 1, (i ?? 0) + 1))
					}
				/>
			)}
		</Card>
	);
}
