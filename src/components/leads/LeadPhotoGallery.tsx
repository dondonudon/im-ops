"use client";
import { Upload, X, ZoomIn } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { useEffect, useMemo, useRef, useState } from "react";
import { type LightboxPhoto, PhotoLightbox } from "@/components/shared/PhotoLightbox";
import { buttonStyles, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/utils";

type Photo = {
	id: string;
	storage_path: string;
	caption: string | null;
	uploaded_at: string;
};

/**
 * Lead photo gallery with upload support.
 * Images are resized client-side to max 1600px WebP before upload.
 *
 * @security - Only authenticated users can upload (enforced by Supabase RLS + Storage policies)
 * - Client-side resize limits uploaded file sizes (green software principle)
 */
export function LeadPhotoGallery({
	leadId,
	photos: initialPhotos,
}: {
	leadId: string;
	photos: Photo[];
}) {
	const t = useTranslations("panels.photos");
	const tActions = useTranslations("actions");
	const tErrors = useTranslations("common.errors");
	const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const [showAll, setShowAll] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const supabase = useMemo(() => createClient(), []);
	const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
	// Cache: storage_path → { url, expiresAt (ms) }
	const urlCache = useRef<Map<string, { url: string; expiresAt: number }>>(new Map());

	useEffect(() => {
		let cancelled = false;
		async function refreshUrls() {
			const TTL = 3600; // seconds
			const now = Date.now();
			const entries = await Promise.all(
				photos.map(async (p) => {
					const cached = urlCache.current.get(p.storage_path);
					// Reuse if cached URL has >60s remaining
					if (cached && cached.expiresAt > now + 60_000) {
						return [p.storage_path, cached.url] as const;
					}
					const { data } = await supabase.storage
						.from("lead-photos")
						.createSignedUrl(p.storage_path, TTL);
					const url = data?.signedUrl ?? "";
					if (url) {
						urlCache.current.set(p.storage_path, { url, expiresAt: now + TTL * 1000 });
					}
					return [p.storage_path, url] as const;
				}),
			);
			if (!cancelled) setPhotoUrls(new Map(entries));
		}
		refreshUrls();
		return () => {
			cancelled = true;
		};
	}, [photos, supabase]);

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files ?? []);
		if (files.length === 0) return;
		setError(null);
		setUploading(true);

		const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

		try {
			for (const file of files) {
				// Validate file type
				if (!file.type.startsWith("image/")) {
					setError(tErrors("notAnImage", { name: file.name }));
					continue;
				}
				if (file.size > MAX_IMAGE_BYTES) {
					setError(tErrors("uploadFailed"));
					continue;
				}

				// Resize + convert to WebP
				const blob = await resizeImage(file);
				const fileName = `${crypto.randomUUID()}.webp`;
				const storagePath = `${leadId}/${fileName}`;

				const { error: uploadErr } = await supabase.storage
					.from("lead-photos")
					.upload(storagePath, blob, { contentType: "image/webp" });

				if (uploadErr) throw uploadErr;

				const { data: record, error: dbErr } = await supabase
					.from("lead_photos")
					.insert({ lead_id: leadId, storage_path: storagePath })
					.select("id, storage_path, caption, uploaded_at")
					.single();

				if (dbErr) throw dbErr;

				// Optimistic UI update
				setPhotos((prev) => [...prev, record]);
				setShowAll(true);
			}
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : tErrors("uploadFailed"));
		} finally {
			setUploading(false);
			// Reset input so the same file can be re-selected
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	}

	async function handleDelete(photo: Photo) {
		await supabase.storage.from("lead-photos").remove([photo.storage_path]);
		await supabase.from("lead_photos").delete().eq("id", photo.id);
		setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
	}

	return (
		<Card aria-label={t("sectionAria")} className="p-5 space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
					{t("titleCount", { count: photos.length })}
				</h2>
				<label
					htmlFor="photo-upload"
					className={buttonStyles({
						variant: "secondary",
						size: "sm",
						className: "cursor-pointer",
					})}
				>
					<Upload size={14} aria-hidden="true" />
					{uploading ? t("uploading") : t("upload")}
					<input
						id="photo-upload"
						ref={fileInputRef}
						type="file"
						accept="image/*"
						multiple
						className="sr-only"
						onChange={handleFileChange}
						disabled={uploading}
						aria-label={tActions("uploadPhoto")}
					/>
				</label>
			</div>

			{error && (
				<div role="alert" className="text-xs text-danger">
					{error}
				</div>
			)}

			{photos.length === 0 ? (
				<p className="text-sm text-ink-faint text-center py-4">{t("empty")}</p>
			) : (
				<>
					<ul
						className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
						aria-label={t("listAria")}
					>
						{(showAll ? photos : photos.slice(0, 8)).map((photo) => {
							const actualIndex = photos.indexOf(photo);
							return (
								<li
									key={photo.id}
									className="relative group rounded-lg overflow-hidden aspect-square bg-subtle"
								>
									{photoUrls.get(photo.storage_path) ? (
										<>
											<Image
												src={photoUrls.get(photo.storage_path) as string}
												alt={photo.caption ?? t("fallbackAlt")}
												fill
												priority={actualIndex === 0}
												className="object-cover transition-transform duration-200 group-hover:scale-105"
												sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
											/>
											<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
											<button
												type="button"
												onClick={() => setLightboxIndex(actualIndex)}
												className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
												aria-label={t("viewPhoto", {
													n: actualIndex + 1,
													total: photos.length,
												})}
											>
												<ZoomIn
													size={22}
													className="text-white drop-shadow-lg"
													aria-hidden="true"
												/>
											</button>
											<button
												type="button"
												onClick={() => handleDelete(photo)}
												className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-opacity z-10"
												aria-label={t("deletePhoto")}
											>
												<X size={12} aria-hidden="true" />
											</button>
										</>
									) : (
										<div className="absolute inset-0 animate-pulse bg-subtle" />
									)}
								</li>
							);
						})}
					</ul>
					{photos.length > 8 && (
						<button
							type="button"
							onClick={() => setShowAll((v) => !v)}
							className="w-full text-xs font-medium text-ink-muted hover:text-ink transition-colors py-1.5"
						>
							{showAll
								? "Show less"
								: `Show ${photos.length - 8} more photo${photos.length - 8 !== 1 ? "s" : ""}`}
						</button>
					)}
				</>
			)}

			{/* Lightbox */}
			{lightboxIndex !== null && (
				<PhotoLightbox
					photos={photos.map(
						(p): LightboxPhoto => ({
							src: photoUrls.get(p.storage_path) ?? "",
							alt: p.caption ?? t("fallbackAlt"),
							caption: p.caption,
						}),
					)}
					index={lightboxIndex}
					onClose={() => setLightboxIndex(null)}
					onPrev={() => setLightboxIndex((i) => Math.max(0, (i ?? 0) - 1))}
					onNext={() => setLightboxIndex((i) => Math.min(photos.length - 1, (i ?? 0) + 1))}
				/>
			)}
		</Card>
	);
}
