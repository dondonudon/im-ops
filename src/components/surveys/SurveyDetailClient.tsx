"use client";
import { CheckCircle2, Loader2, Plus, Trash2, Upload, ZoomIn } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useRef, useState, useTransition } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { type LightboxPhoto, PhotoLightbox } from "@/components/shared/PhotoLightbox";
import { Button, Card, FormError } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/utils";

type SpecialItem = { type: string; qty: number; note: string };

type MediaRow = {
	id: string;
	media_type: "photo" | "video";
	storage_path: string;
	caption: string | null;
	uploaded_at: string;
};

type SurveyData = {
	id: string;
	lead_id: string;
	access_notes: string | null;
	special_items: SpecialItem[];
	notes: string | null;
	conducted_at: string | null;
};

/**
 * Client-side interactive section for the survey detail page.
 * Handles: editable notes fields, special items list, media gallery upload,
 * and the "Mark as Done" action.
 *
 * @security - All mutations are authenticated via Supabase RLS.
 * - Image uploads are validated client-side (type + resize) before storage upload.
 */
export function SurveyDetailClient({
	survey: initial,
	initialMedia,
}: {
	survey: SurveyData;
	initialMedia: MediaRow[];
}) {
	const router = useRouter();
	const t = useTranslations("forms.survey");
	const tButtons = useTranslations("common.buttons");
	const tErrors = useTranslations("common.errors");
	const tPhotos = useTranslations("panels.photos");
	const [isPending, startTransition] = useTransition();

	// Editable fields
	const [accessNotes, setAccessNotes] = useState(initial.access_notes ?? "");
	const [generalNotes, setGeneralNotes] = useState(initial.notes ?? "");
	const [items, setItems] = useState<SpecialItem[]>(
		Array.isArray(initial.special_items) ? initial.special_items : [],
	);
	const [media, setMedia] = useState<MediaRow[]>(initialMedia);

	const [saving, setSaving] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [markingDone, setMarkingDone] = useState(false);
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const isDone = !!initial.conducted_at;

	// ── Special items ──────────────────────────────────────────────────────
	function addItem() {
		setItems((prev) => [...prev, { type: "", qty: 1, note: "" }]);
	}

	function updateItem(index: number, patch: Partial<SpecialItem>) {
		setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
	}

	function removeItem(index: number) {
		setItems((prev) => prev.filter((_, i) => i !== index));
	}

	// ── Save notes + items ─────────────────────────────────────────────────
	async function handleSave() {
		setSaving(true);
		setError(null);
		try {
			const supabase = createClient();
			const { error: err } = await supabase
				.from("surveys")
				.update({
					access_notes: accessNotes || null,
					special_items: items,
					notes: generalNotes || null,
				})
				.eq("id", initial.id);
			if (err) throw err;
		} catch (e) {
			setError(e instanceof Error ? e.message : tErrors("saveFailed"));
		} finally {
			setSaving(false);
		}
	}

	// ── Photo upload ───────────────────────────────────────────────────────
	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files ?? []);
		if (files.length === 0) return;
		setError(null);
		setUploading(true);

		try {
			const supabase = createClient();
			for (const file of files) {
				if (!file.type.startsWith("image/")) {
					setError(tErrors("notAnImage", { name: file.name }));
					continue;
				}
				const blob = await resizeImage(file);
				const fileName = `${crypto.randomUUID()}.webp`;
				const storagePath = `${initial.id}/${fileName}`;

				const { error: uploadErr } = await supabase.storage
					.from("survey-media")
					.upload(storagePath, blob, { contentType: "image/webp" });
				if (uploadErr) throw uploadErr;

				const { data: row, error: dbErr } = await supabase
					.from("survey_media")
					.insert({
						survey_id: initial.id,
						media_type: "photo",
						storage_path: storagePath,
					})
					.select("id, media_type, storage_path, caption, uploaded_at")
					.single();
				if (dbErr) throw dbErr;
				if (row) setMedia((prev) => [...prev, row]);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : tErrors("uploadFailed"));
		} finally {
			setUploading(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	}

	async function removeMedia(mediaId: string, storagePath: string) {
		const supabase = createClient();
		await supabase.storage.from("survey-media").remove([storagePath]);
		await supabase.from("survey_media").delete().eq("id", mediaId);
		setMedia((prev) => prev.filter((m) => m.id !== mediaId));
	}

	// ── Mark as Done ───────────────────────────────────────────────────────
	async function handleMarkDone() {
		if (isDone) return;
		setMarkingDone(true);
		setError(null);
		try {
			const supabase = createClient();
			const now = new Date().toISOString();
			const { error: surveyErr } = await supabase
				.from("surveys")
				.update({ conducted_at: now })
				.eq("id", initial.id);
			if (surveyErr) throw surveyErr;

			const { error: leadErr } = await supabase
				.from("leads")
				.update({ status: "survey_done" })
				.eq("id", initial.lead_id);
			if (leadErr) throw leadErr;

			startTransition(() => {
				router.push(`/leads/${initial.lead_id}`);
				router.refresh();
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : t("markDoneFailed"));
			setMarkingDone(false);
		}
	}

	return (
		<div className="space-y-5">
			{error && <FormError>{error}</FormError>}

			{/* Access Notes */}
			<Card className="p-5">
				<h2 className="text-sm font-semibold text-ink mb-3">{t("accessNotes")}</h2>
				<label htmlFor="access-notes" className="sr-only">
					{t("accessNotes")}
				</label>
				<textarea
					id="access-notes"
					value={accessNotes}
					onChange={(e) => setAccessNotes(e.target.value)}
					placeholder={t("accessNotesPlaceholder")}
					rows={3}
					disabled={isDone}
					className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none disabled:opacity-60 transition-colors"
				/>
			</Card>

			{/* Special Items */}
			<Card className="p-5">
				<div className="flex items-center justify-between mb-3">
					<h2 className="text-sm font-semibold text-ink">{t("specialItems")}</h2>
					{!isDone && (
						<button
							type="button"
							onClick={addItem}
							className="flex items-center gap-1.5 text-xs font-medium text-primary-text hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded transition-colors"
						>
							<Plus size={13} aria-hidden="true" />
							{t("addItem")}
						</button>
					)}
				</div>

				{items.length === 0 ? (
					<p className="text-sm text-ink-faint text-center py-4">{t("noSpecialItems")}</p>
				) : (
					<ul className="space-y-2" aria-label={t("specialItems")}>
						{items.map((item, i) => (
							<li key={i} className="flex gap-2 items-start">
								<input
									type="text"
									aria-label={`${t("itemType")} ${i + 1}`}
									value={item.type}
									onChange={(e) => updateItem(i, { type: e.target.value })}
									placeholder={t("itemType")}
									disabled={isDone}
									className="flex-1 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
								/>
								<NumericInput
									aria-label={`${t("qty")} ${i + 1}`}
									value={item.qty}
									onChange={(v) => updateItem(i, { qty: Math.max(1, v || 1) })}
									disabled={isDone}
									className="w-16 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink text-center focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
								/>
								<input
									type="text"
									aria-label={`${t("itemNote")} ${i + 1}`}
									value={item.note}
									onChange={(e) => updateItem(i, { note: e.target.value })}
									placeholder={t("itemNote")}
									disabled={isDone}
									className="flex-1 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
								/>
								{!isDone && (
									<button
										type="button"
										onClick={() => removeItem(i)}
										aria-label={t("removeItem")}
										className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-ink-faint hover:text-danger hover:bg-danger-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
									>
										<Trash2 size={14} aria-hidden="true" />
									</button>
								)}
							</li>
						))}
					</ul>
				)}
			</Card>

			{/* Media Gallery */}
			<Card className="p-5">
				<div className="flex items-center justify-between mb-3">
					<h2 className="text-sm font-semibold text-ink">{t("media")}</h2>
					<label
						htmlFor="survey-media-upload"
						className={`flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--ring)] rounded ${
							uploading ? "text-ink-faint cursor-not-allowed" : "text-primary-text hover:opacity-80"
						}`}
					>
						{uploading ? (
							<Loader2 size={13} className="animate-spin" aria-hidden="true" />
						) : (
							<Upload size={13} aria-hidden="true" />
						)}
						{uploading ? tButtons("uploading") : t("uploadMedia")}
						<input
							id="survey-media-upload"
							ref={fileInputRef}
							type="file"
							accept="image/*"
							multiple
							disabled={uploading}
							onChange={handleFileChange}
							className="sr-only"
							aria-label={t("uploadMedia")}
						/>
					</label>
				</div>

				{media.length === 0 ? (
					<p className="text-sm text-ink-faint text-center py-6">{t("noMedia")}</p>
				) : (
					<ul className="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-label={t("media")}>
						{media.map((m, i) => {
							const supabase = createClient();
							const { data: urlData } = supabase.storage
								.from("survey-media")
								.getPublicUrl(m.storage_path);
							return (
								<li
									key={m.id}
									className="relative group rounded-xl overflow-hidden aspect-square bg-subtle"
								>
									<Image
										src={urlData.publicUrl}
										alt={m.caption ?? t("photoAlt")}
										fill
										sizes="(max-width: 640px) 50vw, 33vw"
										className="object-cover transition-transform duration-200 group-hover:scale-105"
									/>
									<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
									<button
										type="button"
										onClick={() => setLightboxIndex(i)}
										className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
										aria-label={tPhotos("viewPhoto", {
											n: i + 1,
											total: media.length,
										})}
									>
										<ZoomIn size={22} className="text-white drop-shadow-lg" aria-hidden="true" />
									</button>
									<button
										type="button"
										onClick={() => removeMedia(m.id, m.storage_path)}
										aria-label={tPhotos("deletePhoto")}
										className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white z-10"
									>
										<Trash2 size={11} aria-hidden="true" />
									</button>
								</li>
							);
						})}
					</ul>
				)}

				{/* Lightbox */}
				{lightboxIndex !== null &&
					(() => {
						const supabase = createClient();
						const lightboxPhotos: LightboxPhoto[] = media.map((m) => ({
							src: supabase.storage.from("survey-media").getPublicUrl(m.storage_path).data
								.publicUrl,
							alt: m.caption ?? t("photoAlt"),
							caption: m.caption,
						}));
						return (
							<PhotoLightbox
								photos={lightboxPhotos}
								index={lightboxIndex}
								onClose={() => setLightboxIndex(null)}
								onPrev={() => setLightboxIndex((i) => Math.max(0, (i ?? 0) - 1))}
								onNext={() => setLightboxIndex((i) => Math.min(media.length - 1, (i ?? 0) + 1))}
							/>
						);
					})()}
			</Card>

			{/* General Notes */}
			<Card className="p-5">
				<h2 className="text-sm font-semibold text-ink mb-3">{t("generalNotes")}</h2>
				<label htmlFor="general-notes" className="sr-only">
					{t("generalNotes")}
				</label>
				<textarea
					id="general-notes"
					value={generalNotes}
					onChange={(e) => setGeneralNotes(e.target.value)}
					placeholder={t("generalNotesPlaceholder")}
					rows={4}
					disabled={isDone}
					className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none disabled:opacity-60 transition-colors"
				/>
			</Card>

			{/* Actions */}
			{!isDone && (
				<div className="flex gap-3">
					<Button type="button" onClick={handleSave} loading={saving} variant="secondary">
						{saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
						{saving ? tButtons("saving") : t("saveSurveyNotes")}
					</Button>

					<Button
						type="button"
						onClick={handleMarkDone}
						disabled={markingDone || isPending}
						loading={markingDone}
						variant="primary"
					>
						{markingDone ? (
							<Loader2 size={15} className="animate-spin" aria-hidden="true" />
						) : (
							<CheckCircle2 size={15} aria-hidden="true" />
						)}
						{markingDone ? tButtons("saving") : t("markAsDone")}
					</Button>
				</div>
			)}

			{isDone && (
				<div className="flex items-center gap-2 text-sm text-success font-medium">
					<CheckCircle2 size={16} aria-hidden="true" />
					{t("markedAsCompleted")}
				</div>
			)}
		</div>
	);
}
