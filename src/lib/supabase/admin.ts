import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Server-only Supabase client authenticated with the SERVICE ROLE key.
 *
 * This BYPASSES Row Level Security. It exists solely so the background SEO sync
 * (cron route + backfill script) can upsert raw Search Console metrics, which
 * authenticated browser clients are not permitted to write.
 *
 * ⚠️  Containment rules (enforce in review — this is the app's only service-role
 *     usage):
 *   - Import ONLY from the SEO sync path: src/lib/search-console/sync.ts, the
 *     cron route, and scripts/backfill-search-console.ts.
 *   - NEVER import from a Server Component that renders for a user, from
 *     anything under src/components/, or from a Client Component.
 *   - For user-facing reads use src/lib/supabase/server.ts (RLS enforced).
 *
 * The `server-only` import above makes bundling this into client code a build
 * error — a backstop for the rules above.
 */
export function createAdminClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!url) {
		throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
	}
	if (!serviceRoleKey) {
		throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
	}

	return createClient<Database>(url, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}
