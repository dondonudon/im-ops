import { type NextRequest, NextResponse } from "next/server";
import { runScheduledSync } from "@/lib/search-console/scheduled";

/**
 * Daily Search Console sync, invoked by Vercel Cron (see vercel.json).
 *
 * Auth: a bearer `CRON_SECRET` header only — never a query param, body, or
 * cookie. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically
 * when CRON_SECRET is configured. This route is exempted from the Supabase auth
 * gate in middleware.ts, so this check is the sole gate.
 *
 * Returns 200 when all active properties synced (or were skipped as already
 * running) and 500 if any hard-failed, so Vercel surfaces failures — while the
 * per-property detail is always recorded in seo_sync_runs regardless.
 */

export const dynamic = "force-dynamic";
// Requires a Vercel plan that allows a 60s function (Pro+). Lower for Hobby.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
	const secret = process.env.CRON_SECRET;
	const authorization = request.headers.get("authorization");

	if (!secret || authorization !== `Bearer ${secret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const summary = await runScheduledSync();
		return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
	} catch (err) {
		// Reaching here means the sync could not even enumerate properties.
		console.error("[seo-cron] scheduled sync crashed:", err instanceof Error ? err.message : err);
		return NextResponse.json({ error: "Scheduled sync failed" }, { status: 500 });
	}
}
