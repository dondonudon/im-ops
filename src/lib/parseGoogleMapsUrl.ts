export interface ParsedCoords {
	lat: number;
	lng: number;
}

/** Coordinates plus a human-readable address (when the link carries one). */
export interface ResolvedMapPlace {
	lat: number;
	lng: number;
	address: string | null;
}

/**
 * Pull a human-readable place/address out of a Maps URL's query (`q` / `query` /
 * `destination`). Modern share links put the place name here. Returns null when the
 * value is missing or is itself a bare lat,lng pair (not user-facing).
 */
export function extractAddressFromMapsUrl(url: string): string | null {
	try {
		const parsed = new URL(url.trim());
		for (const key of ["q", "query", "destination"]) {
			const v = parsed.searchParams.get(key)?.trim();
			if (v && !/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(v)) return v;
		}
		return null;
	} catch {
		return null;
	}
}

export function parseGoogleMapsUrl(url: string): ParsedCoords | null {
	try {
		const parsed = new URL(url.trim());

		// ?q=lat,lng
		const q = parsed.searchParams.get("q");
		if (q) {
			const m = q.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
			if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
		}

		// /@lat,lng,zoom pattern (Google Maps place pages)
		const atMatch = parsed.pathname.match(/\/@(-?\d+\.?\d*),(-?\d+\.?\d*),/);
		if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

		// ?ll=lat,lng (Waze / old formats)
		const ll = parsed.searchParams.get("ll");
		if (ll) {
			const m = ll.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
			if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
		}

		return null;
	} catch {
		return null;
	}
}

export function isShortGoogleMapsUrl(url: string): boolean {
	return /maps\.app\.goo\.gl|goo\.gl\/maps/.test(url);
}

/**
 * Best-effort coordinate extraction from a resolved Google Maps HTML page.
 * Modern share links (maps.app.goo.gl) redirect to a `?q=<place name>` URL that
 * carries NO coordinates, but the page body embeds the map center — most reliably
 * in the static-map preview URL. Tried in order of reliability.
 */
export function extractCoordsFromHtml(html: string): ParsedCoords | null {
	// staticmap center=LAT,LNG (comma may be URL-encoded as %2C) — the pinned center
	const center = html.match(/staticmap\?[^"']*?center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/);
	if (center) return { lat: parseFloat(center[1]), lng: parseFloat(center[2]) };

	// /@lat,lng (map view centered on the place)
	const at = html.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
	if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };

	// !3dLAT!4dLNG (place-data blocks)
	const d = html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
	if (d) return { lat: parseFloat(d[1]), lng: parseFloat(d[2]) };

	return null;
}
