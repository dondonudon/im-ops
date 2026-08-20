import type { SupabaseClient } from "@supabase/supabase-js";

export type UrlCache = Map<string, { url: string; expiresAt: number }>;

/**
 * Normalizes a stored `receipt_url` to a bucket-relative storage path.
 * New rows store a bare path ("<jobId>/<uuid>.webp"); legacy rows store a full
 * public URL containing "/receipts/". Handles both.
 */
export function receiptStoragePath(value: string): string {
	const marker = "/receipts/";
	const idx = value.indexOf(marker);
	return idx !== -1 ? value.slice(idx + marker.length) : value;
}

/**
 * Fetches signed URLs for a set of storage paths in a single batch request,
 * reusing cached URLs that still have more than 60 seconds remaining.
 *
 * Returns a Map<path, signedUrl>. Paths that fail to sign map to "".
 */
export async function batchSignedUrls(
	supabase: SupabaseClient,
	bucket: string,
	paths: string[],
	cache: UrlCache,
	ttlSeconds = 3600,
): Promise<Map<string, string>> {
	if (paths.length === 0) return new Map();

	const now = Date.now();
	const result = new Map<string, string>();
	const stale: string[] = [];

	for (const path of paths) {
		const cached = cache.get(path);
		if (cached && cached.expiresAt > now + 60_000) {
			result.set(path, cached.url);
		} else {
			stale.push(path);
		}
	}

	if (stale.length > 0) {
		const { data } = await supabase.storage.from(bucket).createSignedUrls(stale, ttlSeconds);
		const expiresAt = now + ttlSeconds * 1000;
		for (const item of data ?? []) {
			const url = item.signedUrl ?? "";
			const path = item.path ?? "";
			if (!path) continue;
			result.set(path, url);
			if (url) cache.set(path, { url, expiresAt });
		}
	}

	return result;
}
