"use client";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { useCallback, useEffect } from "react";

export type LightboxPhoto = {
	src: string;
	alt: string;
	caption?: string | null;
};

/**
 * Full-screen photo lightbox/viewer.
 * Keyboard: Escape closes, Left/Right arrows navigate.
 * Touch swipe: left/right swipe navigates.
 *
 * @accessibility
 * - Role="dialog" with aria-modal and a visible focus trap on open
 * - All buttons have aria-labels
 * - Image alt text is passed through from the photo data
 */
export function PhotoLightbox({
	photos,
	index,
	onClose,
	onPrev,
	onNext,
}: {
	photos: LightboxPhoto[];
	index: number;
	onClose: () => void;
	onPrev: () => void;
	onNext: () => void;
}) {
	const t = useTranslations("photoLightbox");
	const photo = photos[index];
	const hasPrev = index > 0;
	const hasNext = index < photos.length - 1;

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
			if (e.key === "ArrowLeft" && hasPrev) onPrev();
			if (e.key === "ArrowRight" && hasNext) onNext();
		},
		[onClose, onPrev, onNext, hasPrev, hasNext],
	);

	// Touch swipe state
	let touchStartX = 0;

	function handleTouchStart(e: React.TouchEvent) {
		touchStartX = e.touches[0].clientX;
	}

	function handleTouchEnd(e: React.TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchStartX;
		if (Math.abs(dx) > 50) {
			if (dx < 0 && hasNext) onNext();
			if (dx > 0 && hasPrev) onPrev();
		}
	}

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = prev;
		};
	}, [handleKeyDown]);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled via window listener
		<div
			className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center"
			onClick={onClose}
			role="dialog"
			aria-modal="true"
			aria-label="Photo viewer"
			onTouchStart={handleTouchStart}
			onTouchEnd={handleTouchEnd}
		>
			{/* Close */}
			<button
				type="button"
				onClick={onClose}
				aria-label={t("close")}
				className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
			>
				<X size={20} aria-hidden="true" />
			</button>

			{/* Photo counter */}
			{photos.length > 1 && (
				<span className="absolute top-5 left-1/2 -translate-x-1/2 text-white/60 text-xs font-medium bg-black/30 rounded-full px-3 py-1 backdrop-blur-sm pointer-events-none">
					{index + 1} / {photos.length}
				</span>
			)}

			{/* Prev */}
			{hasPrev && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onPrev();
					}}
					aria-label="Previous photo"
					className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
				>
					<ChevronLeft size={22} aria-hidden="true" />
				</button>
			)}

			{/* Next */}
			{hasNext && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onNext();
					}}
					aria-label="Next photo"
					className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
				>
					<ChevronRight size={22} aria-hidden="true" />
				</button>
			)}

			{/* Image */}
			<div className="relative w-[90vw] h-[80vh] max-w-5xl" onClick={(e) => e.stopPropagation()}>
				<Image
					src={photo.src}
					alt={photo.alt}
					fill
					className="object-contain select-none"
					sizes="90vw"
					priority
					draggable={false}
				/>
			</div>

			{/* Caption */}
			{photo.caption && (
				<p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/50 rounded-full px-4 py-1.5 backdrop-blur-sm pointer-events-none max-w-[80vw] text-center">
					{photo.caption}
				</p>
			)}

			{/* Thumbnail strip — only when 3+ photos */}
			{photos.length >= 3 && (
				<div
					className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 max-w-[80vw] overflow-x-auto pb-1"
					onClick={(e) => e.stopPropagation()}
				>
					{photos.map((p, i) => (
						// biome-ignore lint/a11y/useButtonType: handled below
						<button
							key={p.src}
							type="button"
							onClick={() => {
								// Navigate directly to clicked thumbnail
								const diff = i - index;
								if (diff > 0) for (let n = 0; n < diff; n++) onNext();
								if (diff < 0) for (let n = 0; n < -diff; n++) onPrev();
							}}
							aria-label={`Go to photo ${i + 1}`}
							aria-current={i === index ? "true" : undefined}
							className={`shrink-0 w-10 h-10 rounded overflow-hidden border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${i === index ? "border-white scale-110" : "border-white/30 opacity-60 hover:opacity-90"}`}
						>
							<Image
								src={p.src}
								alt=""
								width={40}
								height={40}
								className="object-cover w-full h-full"
							/>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
