"use server";

import { revalidatePath } from "next/cache";
import { delayedSyncWindow } from "@/lib/search-console/dates";
import { getActiveProperty, getLatestSeoSync } from "@/lib/search-console/queries";
import { SeoSyncConflictError, syncSearchConsoleProperty } from "@/lib/search-console/sync";
import { createClient } from "@/lib/supabase/server";
import { todayInJakarta } from "@/lib/utils";

/** Reject a manual refresh if the last run started within this window. */
const THROTTLE_MS = 15 * 60 * 1000;

export type RefreshResult = { ok: true } | { ok: false; reason: "throttled" | "running" | "error" };

/**
 * Manually sync the active property over the delayed window. Authenticated
 * users only; throttled to once per 15 minutes; overlapping runs are rejected
 * by the sync's own guard. A refresh does not create new Google data — it only
 * fetches what Search Console has finalized so far.
 */
export async function refreshSeoData(): Promise<RefreshResult> {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return { ok: false, reason: "error" };

	const property = await getActiveProperty(supabase);
	if (!property) return { ok: false, reason: "error" };

	const latest = await getLatestSeoSync(supabase, property.id);
	if (latest && Date.now() - new Date(latest.startedAt).getTime() < THROTTLE_MS) {
		return { ok: false, reason: "throttled" };
	}

	const window = delayedSyncWindow(todayInJakarta());
	try {
		await syncSearchConsoleProperty({
			propertyId: property.id,
			startDate: window.startDate,
			endDate: window.endDate,
			syncType: "manual",
		});
	} catch (err) {
		if (err instanceof SeoSyncConflictError) return { ok: false, reason: "running" };
		console.error("[seo-refresh] failed:", err instanceof Error ? err.message : err);
		return { ok: false, reason: "error" };
	}

	revalidatePath("/growth/seo");
	return { ok: true };
}
