import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders an address as a Google Maps directions link when coordinates are present,
 * otherwise as plain text. Coordinates are never shown — only the human address.
 */
export function AddressLink({
	address,
	lat,
	lng,
	className,
	fallback = "—",
}: {
	address: string | null | undefined;
	lat?: number | null;
	lng?: number | null;
	className?: string;
	fallback?: string;
}) {
	const text = address?.trim();

	if (text && lat != null && lng != null) {
		return (
			<a
				href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
				target="_blank"
				rel="noopener noreferrer"
				className={cn(
					"group inline-flex items-start gap-1 text-ink transition-colors hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded",
					className,
				)}
			>
				<MapPin
					size={12}
					className="mt-0.5 shrink-0 text-ink-faint group-hover:text-primary-text"
					aria-hidden="true"
				/>
				<span className="group-hover:underline">{text}</span>
			</a>
		);
	}

	return <span className={className}>{text || fallback}</span>;
}
