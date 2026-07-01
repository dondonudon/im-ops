export interface ParsedCoords {
	lat: number;
	lng: number;
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
