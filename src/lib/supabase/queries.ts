import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-request deduplicated query helpers for data that rarely changes.
 * React's `cache()` ensures each function runs at most once per render pass,
 * even when called from multiple Server Components on the same page.
 * Cross-request caching via `unstable_cache` is intentionally avoided here
 * because these queries use cookie-based auth and must respect RLS per user.
 */

/** All system_settings rows, deduplicated per request. */
export const getSystemSettings = cache(async () => {
	const supabase = await createClient();
	const { data } = await supabase.from("system_settings").select("key, value, category");
	return data ?? [];
});

/** Active fleet vehicles, deduplicated per request. */
export const getActiveFleet = cache(async () => {
	const supabase = await createClient();
	const { data } = await supabase
		.from("fleet")
		.select("id, name")
		.eq("is_active", true)
		.order("name");
	return data ?? [];
});

/** Active crew members, deduplicated per request. */
export const getActiveCrew = cache(async () => {
	const supabase = await createClient();
	const { data } = await supabase
		.from("crew")
		.select("id, name, daily_rate")
		.eq("is_active", true)
		.order("name");
	return data ?? [];
});
