"use server";
import { type ParsedCoords, parseGoogleMapsUrl } from "@/lib/parseGoogleMapsUrl";

export async function resolveMapUrl(url: string): Promise<ParsedCoords | null> {
	try {
		const res = await fetch(url, { redirect: "follow", method: "HEAD" });
		return parseGoogleMapsUrl(res.url);
	} catch {
		return null;
	}
}
