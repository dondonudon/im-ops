"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { batchSignedUrls, receiptStoragePath, type UrlCache } from "@/lib/storage/signedUrls";

type WithReceipt = { id: string; receipt_url: string | null };

/**
 * Signs receipt URLs for a list of expenses, keyed by expense id.
 * The `receipts` bucket is private, so reads sign on demand; URLs are cached
 * across renders and re-signed only once they near expiry.
 */
export function useReceiptUrls(supabase: SupabaseClient, rows: WithReceipt[]): Map<string, string> {
	const [urls, setUrls] = useState<Map<string, string>>(new Map());
	const cache = useRef<UrlCache>(new Map());

	useEffect(() => {
		const withReceipts = rows.filter((r) => r.receipt_url);
		if (withReceipts.length === 0) return;

		let cancelled = false;
		(async () => {
			const paths = withReceipts.map((r) => receiptStoragePath(r.receipt_url as string));
			const byPath = await batchSignedUrls(supabase, "receipts", paths, cache.current);
			const byId = new Map<string, string>();
			for (const r of withReceipts) {
				byId.set(r.id, byPath.get(receiptStoragePath(r.receipt_url as string)) ?? "");
			}
			if (!cancelled) setUrls(byId);
		})();

		return () => {
			cancelled = true;
		};
	}, [rows, supabase]);

	return urls;
}
