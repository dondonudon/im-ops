"use client";
import { Play } from "lucide-react";
import Image from "next/image";

/**
 * Thumbnail contents for an evidence gallery tile: a photo (via next/image) or
 * a video (native <video> showing a poster frame with a play badge). Renders a
 * loading pulse while the signed URL resolves.
 *
 * Meant to sit as the first child of a `relative … aspect-square` tile, with the
 * darkening overlay + action buttons rendered as siblings after it.
 */
export function MediaThumb({
	url,
	kind,
	alt,
	priority,
}: {
	url: string | undefined;
	kind: "photo" | "video";
	alt: string;
	priority?: boolean;
}) {
	if (!url) {
		return <div className="absolute inset-0 animate-pulse bg-subtle" />;
	}

	if (kind === "video") {
		return (
			<>
				{/* #t=0.1 nudges the element to render a poster frame instead of black. */}
				<video
					src={`${url}#t=0.1`}
					muted
					playsInline
					preload="metadata"
					className="absolute inset-0 h-full w-full object-cover"
					aria-label={alt}
				/>
				<span className="absolute bottom-1.5 left-1.5 z-[1] flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white pointer-events-none">
					<Play size={12} fill="currentColor" aria-hidden="true" />
				</span>
			</>
		);
	}

	return (
		<Image
			src={url}
			alt={alt}
			fill
			priority={priority}
			sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
			className="object-cover transition-transform duration-200 group-hover:scale-105"
		/>
	);
}
