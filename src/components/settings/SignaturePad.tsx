"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Setting = {
	key: string;
	value: string;
	category: string | null;
	description: string | null;
};

export function SignaturePad({ setting }: { setting: Setting }) {
	const router = useRouter();
	const t = useTranslations("pages.settings.signaturePad");
	const dialogRef = useRef<HTMLDialogElement>(null);
	const canvasRef = useRef<SignatureCanvas>(null);
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
	const [error, setError] = useState<string | null>(null);
	const [currentUrl, setCurrentUrl] = useState(setting.value);


	function openModal() {
		canvasRef.current?.clear();
		setError(null);
		setSaveState("idle");
		dialogRef.current?.showModal();
	}

	function closeModal() {
		dialogRef.current?.close();
	}

	// Close on backdrop click
	function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
		if (e.target === dialogRef.current) closeModal();
	}

	// Prevent body scroll while open
	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const onOpen = () => (document.body.style.overflow = "hidden");
		const onClose = () => (document.body.style.overflow = "");
		dialog.addEventListener("close", onClose);
		// dialog doesn't fire an "open" event; we set overflow in openModal instead
		return () => {
			dialog.removeEventListener("close", onClose);
		};
	}, []);

	async function handleSave() {
		const canvas = canvasRef.current;
		if (!canvas || canvas.isEmpty()) return;

		setSaveState("saving");
		setError(null);

		try {
			const dataUrl = canvas.toDataURL("image/png");
			const res = await fetch(dataUrl);
			const blob = await res.blob();
			const file = new File([blob], `${setting.key}.png`, { type: "image/png" });

			const supabase = createClient();
			const path = `${setting.key}.png`;

			const { error: uploadError } = await supabase.storage
				.from("signatures")
				.upload(path, file, { upsert: true, contentType: "image/png" });

			if (uploadError) throw uploadError;

			const { data: urlData } = supabase.storage.from("signatures").getPublicUrl(path);
			const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

			const { error: dbError } = await supabase
				.from("system_settings")
				.update({ value: publicUrl, updated_at: new Date().toISOString() })
				.eq("key", setting.key);

			if (dbError) throw dbError;

			setCurrentUrl(publicUrl);
			setSaveState("saved");
			closeModal();
			router.refresh();
		} catch {
			setError(t("uploadFailed"));
			setSaveState("idle");
		}
	}

	const label = setting.description ?? setting.key;

	return (
		<>
			{/* Inline row — matches GenericSettingRow layout */}
			<div className="flex items-center gap-4 px-4 py-3">
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium text-ink leading-snug">{label}</p>
					<p className="text-xs font-mono text-ink-faint mt-0.5">{setting.key}</p>
				</div>
				<div className="flex items-center gap-3 shrink-0">
					{currentUrl ? (
						<Image
							src={currentUrl}
							alt={t("imageAlt")}
							width={80}
							height={28}
							unoptimized
							className="h-7 w-20 object-contain rounded border border-line bg-white"
						/>
					) : (
						<span className="text-xs text-ink-faint italic">{t("noSignature")}</span>
					)}
					<Button type="button" variant="secondary" size="sm" onClick={openModal}>
						{currentUrl ? t("editButton") : t("setButton")}
					</Button>
				</div>
			</div>

			{/* Modal */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog handles Escape natively */}
			<dialog
				ref={dialogRef}
				onClick={handleDialogClick}
				className="rounded-2xl border border-line bg-surface shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-sm p-0 w-full max-w-md open:flex open:flex-col"
				aria-label={label}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-line">
					<h2 className="text-base font-semibold text-ink">{label}</h2>
					<button
						type="button"
						onClick={closeModal}
						aria-label={t("cancel")}
						className="text-ink-muted hover:text-ink transition-colors"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				{/* Body */}
				<div className="px-5 py-4 space-y-4">
					{/* Current signature preview */}
					{currentUrl && (
						<div className="rounded-lg border border-line bg-surface-sunken p-3">
							<p className="text-xs text-ink-muted mb-2">{t("currentLabel")}</p>
							<Image
								src={currentUrl}
								alt={t("imageAlt")}
								width={200}
								height={64}
								unoptimized
								className="max-h-16 object-contain"
							/>
						</div>
					)}

					{/* Drawing canvas */}
					<div className="rounded-lg border border-line-strong bg-white overflow-hidden">
						<SignatureCanvas
							ref={canvasRef}
							penColor="#1f2937"
							canvasProps={{
								width: 448,
								height: 140,
								className: "w-full touch-none",
								"aria-label": label,
							}}
						/>
					</div>
					<p className="text-xs text-ink-faint">{t("hint")}</p>

					{error && <p className="text-xs text-danger-text">{error}</p>}
				</div>

				{/* Footer */}
				<div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => canvasRef.current?.clear()}
					>
						{t("clear")}
					</Button>
					<Button type="button" variant="secondary" size="sm" onClick={closeModal}>
						{t("cancel")}
					</Button>
					<Button
						type="button"
						variant="primary"
						size="sm"
						loading={saveState === "saving"}
						onClick={handleSave}
					>
						{t("save")}
					</Button>
				</div>
			</dialog>
		</>
	);
}
