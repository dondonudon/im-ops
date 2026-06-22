import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Cached query helpers for data that rarely changes (settings, fleet, crew).
 * Revalidated every 5 minutes (300s). Use `revalidateTag` in mutations that
 * change this data so the cache is invalidated immediately on writes.
 */

/** All system_settings rows, cached for 5 minutes. */
export const getSystemSettings = unstable_cache(
	async () => {
		const supabase = await createClient();
		const { data } = await supabase.from("system_settings").select("key, value, category");
		return data ?? [];
	},
	["system-settings"],
	{ revalidate: 300, tags: ["system-settings"] },
);

/** Active fleet vehicles, cached for 5 minutes. */
export const getActiveFleet = unstable_cache(
	async () => {
		const supabase = await createClient();
		const { data } = await supabase
			.from("fleet")
			.select("id, name")
			.eq("is_active", true)
			.order("name");
		return data ?? [];
	},
	["active-fleet"],
	{ revalidate: 300, tags: ["active-fleet"] },
);

/** Active crew members, cached for 5 minutes. */
export const getActiveCrew = unstable_cache(
	async () => {
		const supabase = await createClient();
		const { data } = await supabase
			.from("crew")
			.select("id, name, daily_rate")
			.eq("is_active", true)
			.order("name");
		return data ?? [];
	},
	["active-crew"],
	{ revalidate: 300, tags: ["active-crew"] },
);
