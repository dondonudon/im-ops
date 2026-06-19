"use client";

import { FileText, Loader2, Trash2, Upload, ZoomIn } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { PhotoLightbox } from "@/components/shared/PhotoLightbox";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/utils";

type MediaRow = {
	id: string;
	media_type: "photo" | "pdf";
	storage_path: string;
	file_name: string | null;
	caption: string | null;
	uploaded_at: string;
};

export function JobMediaPanel({
	jobId,
	initialMedia,
}: {
	jobId: string;
	initialMedia: MediaRow[];
}) {
	const t = useTranslations("panels.jobMedia");
	const tErrors = useTranslations("errors");
	const [media, setMedia] = useState<MediaRow[]>(initialMedia);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const [showAll, setShowAll] = useState(false);
	const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
	const fileInputRef = useRef<HTMLInputElement>(null);

	const supabase = useMemo(() => createClient(), []);

	useEffect(() => {
		let cancelled = false;
		async function refreshUrls() {
			const entries = await Promise.all(
				media.map(async (m) => {
					const { data } = await supabase.storage
						.from("job-media")
						.createSignedUrl(m.storage_path, 3600);
					return [m.storage_path, data?.signedUrl ?? ""] as const;
				}),
			);
			if (!cancelled) setSignedUrls(new Map(entries));
		}
		refreshUrls();
		return () => {
			cancelled = true;
		};
	}, [media, supabase]);

	const photos = media.filter((m) => m.media_type === "photo");
	const pdfs = media.filter((m) => m.media_type === "pdf");

	const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
	const MAX_PDF_BYTES = 50 * 1024 * 1024;

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files ?? []);
		if (files.length === 0) return;
		setError(null);
		setUploading(true);

		try {
			for (const file of files) {
				const isPdf = file.type === "application/pdf";
				const isImage = file.type.startsWith("image/");
				if (!isPdf && !isImage) {
					setError(t("unsupportedFile", { name: file.name }));
					continue;
				}
				if (isPdf && file.size > MAX_PDF_BYTES) {
					setError(tErrors("uploadFailed"));
					continue;
				}
				if (isImage && file.size > MAX_IMAGE_BYTES) {
					setError(tErrors("uploadFailed"));
					continue;
				}

				let blob: Blob;
				let fileName: string;
				let contentType: string;
				let mediaType: "photo" | "pdf";

				if (isPdf) {
					blob = file;
					fileName = `${crypto.randomUUID()}.pdf`;
					contentType = "application/pdf";
					mediaType = "pdf";
				} else {
					blob = await resizeImage(file);
					fileName = `${crypto.randomUUID()}.webp`;
					contentType = "image/webp";
					mediaType = "photo";
				}

				const storagePath = `${jobId}/${fileName}`;

				const { error: uploadErr } = await supabase.storage
					.from("job-media")
					.upload(storagePath, blob, { contentType });
				if (uploadErr) throw uploadErr;

				const { data: row, error: dbErr } = await supabase
					.from("job_media")
					.insert({
						job_id: jobId,
						media_type: mediaType,
						storage_path: storagePath,
						file_name: isPdf ? file.name : null,
					})
					.select("id, media_type, storage_path, file_name, caption, uploaded_at")
					.single();
				if (dbErr) throw dbErr;
				if (row) {
					setMedia((prev) => [...prev, row]);
					setShowAll(true);
				}
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : tErrors("uploadFailed"));
		} finally {
			setUploading(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	}

	async function removeMedia(id: string, storagePath: string) {
		await supabase.storage.from("job-media").remove([storagePath]);
		await supabase.from("job_media").delete().eq("id", id);
		setMedia((prev) => prev.filter((m) => m.id !== id));
	}

	const visiblePhotos = showAll ? photos : photos.slice(0, 8);

	return (
		<Card className="p-5 space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
					{media.length > 0 ? t("titleCount", { count: media.length }) : t("title")}
				</h2>
				<label
					htmlFor="job-media-upload"
					className={`flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--ring)] rounded ${
						uploading ? "text-ink-faint cursor-not-allowed" : "text-primary-text hover:opacity-80"
					}`}
				>
					{uploading ? (
						<Loader2 size={13} className="animate-spin" aria-hidden="true" />
					) : (
						<Upload size={13} aria-hidden="true" />
					)}
					{uploading ? t("uploading") : t("upload")}
					<input
						id="job-media-upload"
						ref={fileInputRef}
						type="file"
						accept="image/*,application/pdf"
						multiple
						disabled={uploading}
						onChange={handleFileChange}
						className="sr-only"
						aria-label={t("upload")}
					/>
				</label>
			</div>

			{error && <p className="text-xs text-danger">{error}</p>}

			{media.length === 0 ? (
				<p className="text-sm text-ink-faint text-center py-6">{t("empty")}</p>
			) : (
				<>
					{/* Photo grid */}
					{photos.length > 0 && (
						<ul
							className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
							aria-label={t("photos")}
						>
							{visiblePhotos.map((m) => {
								const photoIndex = photos.indexOf(m);
								const url = signedUrls.get(m.storage_path);
								return (
									<li
										key={m.id}
										className="relative group rounded-xl overflow-hidden aspect-square bg-subtle"
									>
										{url ? (
											<Image
												src={url}
												alt={m.caption ?? t("photoAlt")}
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
											onClick={() => setLightboxIndex(photoIndex)}
											className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
											aria-label={t("viewPhoto", { n: photoIndex + 1, total: photos.length })}
										>
											<ZoomIn size={22} className="text-white drop-shadow-lg" aria-hidden="true" />
										</button>
										<button
											type="button"
											onClick={() => removeMedia(m.id, m.storage_path)}
											aria-label={t("deleteFile")}
											className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white z-10"
										>
											<Trash2 size={11} aria-hidden="true" />
										</button>
									</li>
								);
							})}
						</ul>
					)}

					{photos.length > 8 && (
						<button
							type="button"
							onClick={() => setShowAll((v) => !v)}
							className="w-full text-xs font-medium text-ink-muted hover:text-ink transition-colors py-1"
						>
							{showAll ? t("showLess") : t("showMore", { count: photos.length - 8 })}
						</button>
					)}

					{/* PDF list */}
					{pdfs.length > 0 && (
						<ul className="space-y-1.5" aria-label={t("documents")}>
							{pdfs.map((m) => {
								const url = signedUrls.get(m.storage_path);
								return (
									<li
										key={m.id}
										className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
									>
										<a
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-2 text-primary-text hover:underline min-w-0"
										>
											<FileText size={14} className="shrink-0" aria-hidden="true" />
											<span className="truncate">{m.file_name ?? t("document")}</span>
										</a>
										<button
											type="button"
											onClick={() => removeMedia(m.id, m.storage_path)}
											aria-label={t("deleteFile")}
											className="shrink-0 text-ink-faint hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
										>
											<Trash2 size={14} aria-hidden="true" />
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</>
			)}

			{lightboxIndex !== null && (
				<PhotoLightbox
					photos={photos
						.map((m) => ({
							src: signedUrls.get(m.storage_path) ?? "",
							alt: m.caption ?? t("photoAlt"),
							caption: m.caption,
						}))
						.filter((p) => p.src !== "")}
					index={lightboxIndex}
					onClose={() => setLightboxIndex(null)}
					onPrev={() => setLightboxIndex((i) => Math.max(0, (i ?? 0) - 1))}
					onNext={() => setLightboxIndex((i) => Math.min(photos.length - 1, (i ?? 0) + 1))}
				/>
			)}
		</Card>
	);
}
