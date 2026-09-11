import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Returns the Supabase browser client (Client Components). Uses the public anon
 * key — RLS enforces data access rules.
 *
 * Memoized to a single module-level instance: each createBrowserClient() spins up
 * its own auth client that grabs the `sb-…-auth-token` Web Lock, so creating one
 * per call let concurrent instances collide ("Acquiring an exclusive Navigator
 * LockManager lock … immediately failed"). One shared instance avoids that.
 */
export function createClient() {
	if (browserClient) return browserClient;
	browserClient = createBrowserClient<Database>(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
	);
	return browserClient;
}
