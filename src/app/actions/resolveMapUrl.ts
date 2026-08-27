"use server";
import {
	extractAddressFromMapsUrl,
	extractCoordsFromHtml,
	parseGoogleMapsUrl,
	type ResolvedMapPlace,
} from "@/lib/parseGoogleMapsUrl";
import { validateOutboundUrl } from "@/lib/security/ssrf";
import { createClient } from "@/lib/supabase/server";

/** Hosts a legitimate Google Maps share/short link can point at. */
const ALLOWED_HOSTS = ["goo.gl", "google.com", "maps.google.com", "maps.app.goo.gl"];

export async function resolveMapUrl(url: string): Promise<ResolvedMapPlace | null> {
	// Auth gate — this is a POST endpoint; the client-side host check is bypassable.
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return null;

	// Reject non-https, private/internal, or non-Google hosts before fetching (SSRF).
	const safeUrl = validateOutboundUrl(url, { allowedHosts: ALLOWED_HOSTS });
	if (!safeUrl) return null;

	try {
		const res = await fetch(safeUrl, {
			redirect: "follow",
			// Browser-like UA so Google serves the real map page, not a bot stub.
			headers: {
				"user-agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
			signal: AbortSignal.timeout(8000),
		});

		// The place name/address lives in the resolved URL's ?q= (modern share links).
		const address = extractAddressFromMapsUrl(res.url);

		// Fast path: older link formats carry coords in the resolved URL itself.
		const fromUrl = parseGoogleMapsUrl(res.url);
		if (fromUrl) return { ...fromUrl, address };

		// Modern share links (maps.app.goo.gl → ?q=<place name>) have no coords in
		// the URL — the map center is only in the page body.
		const html = await res.text();
		const fromHtml = extractCoordsFromHtml(html);
		return fromHtml ? { ...fromHtml, address } : null;
	} catch {
		return null;
	}
}
