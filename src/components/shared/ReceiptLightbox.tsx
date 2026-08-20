"use client";
import Image from "next/image";
import { useEffect } from "react";

/**
 * Single-image viewer for expense receipts. Escape or a backdrop click closes.
 *
 * Distinct from `PhotoLightbox`, which is a multi-photo gallery with navigation,
 * counter and thumbnails — a receipt is always one image.
 */
export function ReceiptLightbox({
	url,
	onClose,
	label,
	closeLabel,
}: {
	url: string;
	onClose: () => void;
	label: string;
	closeLabel: string;
}) {
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [onClose]);

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={label}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
		>
			<button
				type="button"
				className="absolute inset-0 w-full h-full cursor-default"
				aria-label={closeLabel}
				onClick={onClose}
			/>
			<button
				type="button"
				className="absolute top-4 right-4 z-10 text-white text-2xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
				onClick={onClose}
				aria-label={closeLabel}
			>
				✕
			</button>
			<div className="relative z-10 max-w-[90vw] max-h-[90vh]">
				<Image
					src={url}
					alt={label}
					width={800}
					height={1100}
					className="max-w-[90vw] max-h-[90vh] w-auto h-auto object-contain rounded shadow-2xl"
				/>
			</div>
		</div>
	);
}
