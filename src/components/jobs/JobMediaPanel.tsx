"use client";

import { FileText, Loader2, Trash2, Upload, ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { MediaThumb } from "@/components/shared/MediaThumb";
import { PhotoLightbox } from "@/components/shared/PhotoLightbox";
import { Card } from "@/components/ui";
import { batchSignedUrls, type UrlCache } from "@/lib/storage/signedUrls";
import { createClient } from "@/lib/supabase/client";
import { prepareVideoUpload, resizeImage, VideoTooLargeError } from "@/lib/utils";

type MediaRow = {
	id: string;
	media_type: "photo" | "video" | "pdf";
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
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const [showAll, setShowAll] = useState(false);
	const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
	const fileInputRef = useRef<HTMLInputElement>(null);
	const urlCache = useRef<UrlCache>(new Map());
	const supabase = useMemo(() => createClient(), []);

	useEffect(() => {
		if (media.length === 0) return;
		let cancelled = false;
		async function refreshUrls() {
			const map = await batchSignedUrls(
				supabase,
				"job-media",
				media.map((m) => m.storage_path),
				urlCache.current,
			);
			if (!cancelled) setSignedUrls(map);
		}
		refreshUrls();
		return () => {
			cancelled = true;
		};
	}, [media, supabase]);

	// Photos and videos share the visual grid; PDFs render as a separate list.
	const visuals = media.filter((m) => m.media_type === "photo" || m.media_type === "video");
	const pdfs = media.filter((m) => m.media_type === "pdf");

	const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
	const MAX_PDF_BYTES = 50 * 1024 * 1024;

	/** Detect file type from magic bytes rather than trusting the browser-supplied MIME type. */
	async function detectFileType(file: File): Promise<"pdf" | "image" | "video" | "unknown"> {
		const header = await file.slice(0, 12).arrayBuffer();
		const bytes = new Uint8Array(header);
		// PDF: %PDF  (25 50 44 46)
		if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
			return "pdf";
		}
		// WebM/Matroska: EBML header (1A 45 DF A3)
		if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
			return "video";
		}
		// MP4 / MOV / 3GP: "ftyp" box at offset 4 (66 74 79 70)
		if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
			return "video";
		}
		// PNG: \x89PNG (89 50 4e 47)
		if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
			return "image";
		}
		// JPEG: \xff\xd8\xff
		if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
			return "image";
		}
		// GIF: GIF8 (47 49 46 38)
		if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
			return "image";
		}
		// WebP: RIFF....WEBP (52 49 46 46 .. .. .. .. 57 45 42 50)
		if (
			bytes[0] === 0x52 &&
			bytes[1] === 0x49 &&
			bytes[2] === 0x46 &&
			bytes[3] === 0x46 &&
			bytes[8] === 0x57 &&
			bytes[9] === 0x45 &&
			bytes[10] === 0x42 &&
			bytes[11] === 0x50
		) {
			return "image";
		}
		// Fallback: trust the browser MIME type for videos whose container we don't
		// sniff above (some phone codecs vary).
		if (file.type.startsWith("video/")) return "video";
		return "unknown";
	}

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files ?? []);
		if (files.length === 0) return;
		setError(null);
		setUploading(true);

		try {
			for (const file of files) {
				const fileType = await detectFileType(file);
				const isPdf = fileType === "pdf";
				const isImage = fileType === "image";
				const isVideo = fileType === "video";
				if (!isPdf && !isImage && !isVideo) {
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
				let mediaType: "photo" | "video" | "pdf";

				if (isPdf) {
					blob = file;
					fileName = `${crypto.randomUUID()}.pdf`;
					contentType = "application/pdf";
					mediaType = "pdf";
				} else if (isVideo) {
					try {
						const prepared = await prepareVideoUpload(file);
						blob = prepared.blob;
						fileName = `${crypto.randomUUID()}.${prepared.ext}`;
						contentType = prepared.contentType;
					} catch (err) {
						if (err instanceof VideoTooLargeError) {
							setError(t("videoTooLarge", { name: file.name }));
							continue;
						}
						throw err;
					}
					mediaType = "video";
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
		setDeletingId(id);
		try {
			await supabase.storage.from("job-media").remove([storagePath]);
			await supabase.from("job_media").delete().eq("id", id);
			setMedia((prev) => prev.filter((m) => m.id !== id));
		} finally {
			setDeletingId(null);
		}
	}

	const visibleVisuals = showAll ? visuals : visuals.slice(0, 8);

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
						accept="image/*,video/*,application/pdf"
						multiple
						disabled={uploading}
						onChange={handleFileChange}
						className="sr-only"
						aria-label={t("upload")}
					/>
				</label>
			</div>

			{error && <p className="text-xs text-danger">{error}</p>}

			{media.length > 0 && (
				<>
					{/* Photo + video grid */}
					{visuals.length > 0 && (
						<ul
							className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
							aria-label={t("photos")}
						>
							{visibleVisuals.map((m) => {
								const visualIndex = visuals.indexOf(m);
								const url = signedUrls.get(m.storage_path);
								return (
									<li
										key={m.id}
										className="relative group rounded-xl overflow-hidden aspect-square bg-subtle"
									>
										<MediaThumb
											url={url}
											kind={m.media_type === "video" ? "video" : "photo"}
											alt={m.caption ?? t("photoAlt")}
										/>
										<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
										<button
											type="button"
											onClick={() => setLightboxIndex(visualIndex)}
											className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
											aria-label={t("viewPhoto", { n: visualIndex + 1, total: visuals.length })}
										>
											<ZoomIn size={22} className="text-white drop-shadow-lg" aria-hidden="true" />
										</button>
										<button
											type="button"
											onClick={() => removeMedia(m.id, m.storage_path)}
											disabled={deletingId === m.id}
											aria-label={t("deleteFile")}
											className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white z-10 disabled:opacity-70"
										>
											{deletingId === m.id ? (
												<Loader2 size={11} className="animate-spin" aria-hidden="true" />
											) : (
												<Trash2 size={11} aria-hidden="true" />
											)}
										</button>
									</li>
								);
							})}
						</ul>
					)}

					{visuals.length > 8 && (
						<button
							type="button"
							onClick={() => setShowAll((v) => !v)}
							className="w-full text-xs font-medium text-ink-muted hover:text-ink transition-colors py-1"
						>
							{showAll ? t("showLess") : t("showMore", { count: visuals.length - 8 })}
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
											disabled={deletingId === m.id}
											aria-label={t("deleteFile")}
											className="shrink-0 text-ink-faint hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded disabled:opacity-50 disabled:pointer-events-none"
										>
											{deletingId === m.id ? (
												<Loader2 size={14} className="animate-spin" aria-hidden="true" />
											) : (
												<Trash2 size={14} aria-hidden="true" />
											)}
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
					photos={visuals
						.map((m) => ({
							src: signedUrls.get(m.storage_path) ?? "",
							alt: m.caption ?? t("photoAlt"),
							caption: m.caption,
							kind: m.media_type === "video" ? ("video" as const) : ("photo" as const),
						}))
						.filter((p) => p.src !== "")}
					index={lightboxIndex}
					onClose={() => setLightboxIndex(null)}
					onPrev={() => setLightboxIndex((i) => Math.max(0, (i ?? 0) - 1))}
					onNext={() => setLightboxIndex((i) => Math.min(visuals.length - 1, (i ?? 0) + 1))}
				/>
			)}
		</Card>
	);
}
