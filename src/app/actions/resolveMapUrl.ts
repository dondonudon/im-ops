"use server";
import { type ParsedCoords, parseGoogleMapsUrl } from "@/lib/parseGoogleMapsUrl";
import { validateOutboundUrl } from "@/lib/security/ssrf";
import { createClient } from "@/lib/supabase/server";

/** Hosts a legitimate Google Maps share/short link can point at. */
const ALLOWED_HOSTS = ["goo.gl", "google.com", "maps.google.com", "maps.app.goo.gl"];

export async function resolveMapUrl(url: string): Promise<ParsedCoords | null> {
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
			method: "HEAD",
			signal: AbortSignal.timeout(5000),
		});
		return parseGoogleMapsUrl(res.url);
	} catch {
		return null;
	}
}
