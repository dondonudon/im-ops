/**
 * Local historical backfill for Search Console data.
 *
 * Loads months of query-level metrics into Supabase so the dashboard has trends
 * from day one instead of waiting for the daily cron to accumulate history.
 *
 * Usage (tsx resolves the `server-only` alias via scripts/tsconfig.json):
 *
 *   npm run seo:backfill -- --start=2025-05-01 --end=2026-07-31
 *   npm run seo:backfill -- --start=2025-05-01 --end=2026-07-31 --force
 *   npm run seo:backfill -- --start=... --end=... --property=sc-domain:indo-mover.com
 *
 * Requires tsx (`npm i -D tsx`) and the SEO env vars (loaded from .env.local by
 * the npm script). Processes one calendar month per sync run; already-completed
 * months are skipped unless --force is passed. A failed month does not abort the
 * rest — the script reports a non-zero exit if any month failed.
 */

import { monthChunks } from "@/lib/search-console/dates";
import { syncSearchConsoleProperty } from "@/lib/search-console/sync";
import { createAdminClient } from "@/lib/supabase/admin";

type Args = { start: string; end: string; siteUrl: string; force: boolean };

function usage(): void {
	console.error(
		"Usage: npm run seo:backfill -- --start=YYYY-MM-DD --end=YYYY-MM-DD [--property=sc-domain:...] [--force]",
	);
}

function isValidDate(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parseArgs(argv: string[]): Args {
	const map = new Map<string, string>();
	let force = false;
	for (const arg of argv) {
		if (arg === "--force") {
			force = true;
			continue;
		}
		const match = arg.match(/^--([^=]+)=(.*)$/);
		if (match) map.set(match[1], match[2]);
	}

	const start = map.get("start") ?? "";
	const end = map.get("end") ?? "";
	const siteUrl = map.get("property") ?? process.env.GSC_SITE_URL ?? "";

	if (!isValidDate(start) || !isValidDate(end)) {
		console.error("Error: --start and --end must be valid YYYY-MM-DD dates.");
		usage();
		process.exit(1);
	}
	if (start > end) {
		console.error("Error: --start must be on or before --end.");
		process.exit(1);
	}
	if (!siteUrl) {
		console.error("Error: no property. Pass --property=sc-domain:... or set GSC_SITE_URL.");
		process.exit(1);
	}

	return { start, end, siteUrl, force };
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const db = createAdminClient();

	const { data: property, error } = await db
		.from("seo_properties")
		.select("id, site_url, display_name")
		.eq("site_url", args.siteUrl)
		.maybeSingle();
	if (error) throw error;
	if (!property) {
		console.error(
			`No SEO property found for site_url="${args.siteUrl}". Seed it first (migration 003).`,
		);
		process.exit(1);
	}

	const chunks = monthChunks(args.start, args.end);
	console.log(
		`Backfilling ${property.display_name} (${property.site_url}): ${chunks.length} month chunk(s), ${args.start} → ${args.end}${args.force ? " [force]" : ""}\n`,
	);

	let synced = 0;
	let skipped = 0;
	let failed = 0;

	for (let i = 0; i < chunks.length; i++) {
		const ch = chunks[i];
		const label = `[${i + 1}/${chunks.length}] ${ch.startDate} → ${ch.endDate}`;

		if (!args.force) {
			const { data: existing } = await db
				.from("seo_sync_runs")
				.select("id")
				.eq("property_id", property.id)
				.eq("sync_type", "backfill")
				.eq("status", "success")
				.eq("start_date", ch.startDate)
				.eq("end_date", ch.endDate)
				.limit(1)
				.maybeSingle();
			if (existing) {
				console.log(`${label} — already backfilled, skipping (use --force to redo)`);
				skipped++;
				continue;
			}
		}

		try {
			const res = await syncSearchConsoleProperty({
				propertyId: property.id,
				startDate: ch.startDate,
				endDate: ch.endDate,
				syncType: "backfill",
			});
			const partial = res.status === "partial" ? " [partial]" : "";
			console.log(
				`${label} — ${res.queryRowsSynced} query, ${res.pageQueryRowsSynced} page-query rows${res.skippedRows ? ` (${res.skippedRows} skipped)` : ""}${partial}`,
			);
			synced++;
		} catch (err) {
			console.error(`${label} — FAILED: ${err instanceof Error ? err.message : String(err)}`);
			failed++;
		}
	}

	console.log(`\nDone. ${synced} synced, ${skipped} skipped, ${failed} failed.`);
	if (failed > 0) process.exit(1);
}

main().catch((err) => {
	console.error("Backfill crashed:", err instanceof Error ? err.message : err);
	process.exit(1);
});
