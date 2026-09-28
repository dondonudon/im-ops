/**
 * One-off maintenance: re-encode storage objects that are really PNGs.
 *
 * Background: `resizeImage` asked `canvas.toBlob` for "image/webp", but the HTML
 * spec makes a browser that cannot encode that type silently return a PNG
 * instead (Safari before 16.4). The upload path then hardcoded a ".webp" name
 * and an "image/webp" content type, so those objects are PNGs wearing a WebP
 * label — and because PNG ignores the quality argument they are ~25x larger
 * than intended (~3 MB vs ~120 KB for the same 1600px photo).
 *
 * The client-side bug is fixed in src/lib/utils.ts; this script repairs the
 * objects already in the bucket. It rewrites the bytes in place, keeping the
 * exact same storage path, so no database rows need to change.
 *
 * Usage (dry run is the default — it never writes):
 *
 *   npm run storage:reencode                          # plan only, no downloads
 *   npm run storage:reencode -- --sample=5            # measure real ratios on 5 files
 *   npm run storage:reencode -- --apply --limit=10    # cautious first batch
 *   npm run storage:reencode -- --apply               # the whole job
 *
 * Safety properties:
 *   - Dry run by default; writing requires an explicit --apply.
 *   - Every original is written to --backup-dir BEFORE its object is
 *     overwritten. A file whose backup cannot be written is skipped.
 *   - Output is verified to be a real WebP and strictly smaller than the
 *     original; otherwise the object is left untouched.
 *   - Nothing is ever deleted. Objects are overwritten in place via upsert.
 *   - Idempotent: only objects whose stored mimetype is image/png are eligible,
 *     so a completed file is skipped on a re-run and the script is resumable.
 *   - A per-file failure is logged and does not abort the run; the process
 *     exits non-zero if any file failed.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createAdminClient } from "@/lib/supabase/admin";

const execFileAsync = promisify(execFile);

/** Buckets that hold user-uploaded images. */
const IMAGE_BUCKETS = ["lead-photos", "survey-media", "job-media", "receipts"];
const PAGE = 100;

type Args = {
	apply: boolean;
	limit: number | null;
	sample: number;
	buckets: string[];
	backupDir: string;
	quality: number;
};

type StoredObject = { bucket: string; path: string; size: number; mimetype: string };

function parseArgs(argv: string[]): Args {
	const map = new Map<string, string>();
	let apply = false;
	for (const arg of argv) {
		if (arg === "--apply") {
			apply = true;
			continue;
		}
		if (arg === "--dry-run") continue;
		const match = arg.match(/^--([^=]+)=(.*)$/);
		if (match) map.set(match[1], match[2]);
	}
	const num = (key: string, fallback: number | null) => {
		const raw = map.get(key);
		if (raw === undefined) return fallback;
		const n = Number(raw);
		if (!Number.isFinite(n) || n <= 0) throw new Error(`--${key} must be a positive number`);
		return n;
	};
	return {
		apply,
		limit: num("limit", null),
		sample: num("sample", 0) ?? 0,
		buckets: (map.get("bucket") ?? IMAGE_BUCKETS.join(",")).split(",").filter(Boolean),
		backupDir: map.get("backup-dir") ?? path.resolve("storage-backup"),
		quality: num("quality", 82) as number,
	};
}

function isPng(b: Buffer): boolean {
	return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function isWebp(b: Buffer): boolean {
	return (
		b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"
	);
}

function mb(bytes: number): string {
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function kb(bytes: number): string {
	return `${Math.round(bytes / 1024)} kB`;
}

async function requireCwebp(): Promise<void> {
	try {
		await execFileAsync("cwebp", ["-version"]);
	} catch {
		throw new Error("cwebp not found on PATH. Install it with: brew install webp");
	}
}

type Client = ReturnType<typeof createAdminClient>;

/** Lists every object under a bucket, descending into folder entries (id === null). */
async function listRecursive(
	supabase: Client,
	bucket: string,
	prefix = "",
): Promise<StoredObject[]> {
	const out: StoredObject[] = [];
	for (let offset = 0; ; offset += PAGE) {
		const { data, error } = await supabase.storage
			.from(bucket)
			.list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
		if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
		if (!data || data.length === 0) break;
		for (const entry of data) {
			const full = `${prefix}${entry.name}`;
			if (entry.id === null) {
				out.push(...(await listRecursive(supabase, bucket, `${full}/`)));
			} else {
				out.push({
					bucket,
					path: full,
					size: Number(entry.metadata?.size ?? 0),
					mimetype: String(entry.metadata?.mimetype ?? ""),
				});
			}
		}
		if (data.length < PAGE) break;
	}
	return out;
}

/**
 * Confirms what is actually stored, by reading object metadata rather than the
 * body. Objects are served through a CDN with `cache_control: max-age=3600`, so
 * downloading immediately after an upsert can return the stale pre-overwrite
 * bytes and report a false failure. The info endpoint reads through to the
 * storage metadata, and costs no egress.
 */
async function verifyStored(obj: StoredObject, expectedBytes: number): Promise<void> {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error("Supabase env vars missing");
	const encodedPath = obj.path.split("/").map(encodeURIComponent).join("/");
	const res = await fetch(`${url}/storage/v1/object/info/${obj.bucket}/${encodedPath}`, {
		headers: { Authorization: `Bearer ${key}`, apikey: key },
	});
	if (!res.ok) throw new Error(`verification failed: info returned ${res.status}`);
	const info = (await res.json()) as { content_type?: string; size?: number };
	if (info.content_type !== "image/webp") {
		throw new Error(`verification failed: stored content_type is ${info.content_type}`);
	}
	if (info.size !== expectedBytes) {
		throw new Error(`verification failed: stored size ${info.size} != ${expectedBytes}`);
	}
}

/** Downloads, re-encodes and (when applying) overwrites one object in place. */
async function processOne(
	supabase: Client,
	obj: StoredObject,
	args: Args,
	tmpDir: string,
): Promise<{ before: number; after: number; skipped?: string }> {
	const { data, error } = await supabase.storage.from(obj.bucket).download(obj.path);
	if (error || !data) throw new Error(`download failed: ${error?.message ?? "no body"}`);
	const original = Buffer.from(await data.arrayBuffer());

	if (!isPng(original))
		return { before: original.length, after: original.length, skipped: "not actually a PNG" };

	const safeName = `${obj.bucket}__${obj.path}`.replace(/[^a-zA-Z0-9._-]/g, "_");
	const inFile = path.join(tmpDir, `${safeName}.png`);
	const outFile = path.join(tmpDir, `${safeName}.webp`);

	// Back the original up to disk before anything can overwrite it.
	const backupPath = path.join(args.backupDir, obj.bucket, obj.path);
	await mkdir(path.dirname(backupPath), { recursive: true });
	await writeFile(backupPath, original);

	let encoded: Buffer;
	try {
		await writeFile(inFile, original);
		await execFileAsync("cwebp", [
			"-quiet",
			"-mt",
			"-q",
			String(args.quality),
			inFile,
			"-o",
			outFile,
		]);
		encoded = await readFile(outFile);
	} finally {
		// Scratch copies would otherwise double peak disk use across a full run.
		await rm(inFile, { force: true });
		await rm(outFile, { force: true });
	}

	if (!isWebp(encoded)) throw new Error("cwebp produced something that is not a WebP");
	if (encoded.length >= original.length) {
		return {
			before: original.length,
			after: original.length,
			skipped: "re-encode was not smaller",
		};
	}

	if (args.apply) {
		const up = await supabase.storage
			.from(obj.bucket)
			.upload(obj.path, encoded, { contentType: "image/webp", upsert: true });
		if (up.error) throw new Error(`upload failed: ${up.error.message}`);

		await verifyStored(obj, encoded.length);
	}

	return { before: original.length, after: encoded.length };
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	await requireCwebp();

	const supabase = createAdminClient();
	const tmpDir = path.join(args.backupDir, ".tmp");
	await mkdir(tmpDir, { recursive: true });

	console.log(args.apply ? "MODE: APPLY (will overwrite objects)" : "MODE: DRY RUN (no writes)");
	console.log(`backup dir: ${args.backupDir}`);
	console.log(`buckets:    ${args.buckets.join(", ")}\n`);

	let all: StoredObject[] = [];
	for (const bucket of args.buckets) {
		const objects = await listRecursive(supabase, bucket);
		const pngs = objects.filter((o) => o.mimetype === "image/png");
		const bytes = pngs.reduce((sum, o) => sum + o.size, 0);
		console.log(
			`${bucket.padEnd(14)} ${String(objects.length).padStart(4)} objects, ${String(pngs.length).padStart(4)} PNG (${mb(bytes)})`,
		);
		all.push(...pngs);
	}

	// Only rewrite objects already named .webp: the bytes become correct and the
	// stored path stays valid. A PNG named .png would need a DB path update too,
	// so leave those alone and report them instead.
	const mismatched = all.filter((o) => !o.path.toLowerCase().endsWith(".webp"));
	all = all.filter((o) => o.path.toLowerCase().endsWith(".webp"));
	if (mismatched.length > 0) {
		console.log(
			`\nskipping ${mismatched.length} PNG(s) not named .webp (would need a DB path change):`,
		);
		for (const o of mismatched.slice(0, 10)) console.log(`  ${o.bucket}/${o.path}`);
	}

	const totalBefore = all.reduce((sum, o) => sum + o.size, 0);
	console.log(`\neligible: ${all.length} objects, ${mb(totalBefore)}`);
	if (all.length === 0) {
		console.log("nothing to do.");
		return;
	}

	const targets = args.apply ? all.slice(0, args.limit ?? all.length) : all.slice(0, args.sample);

	if (!args.apply && targets.length === 0) {
		console.log("\nDry run: pass --sample=N to measure real compression on N files,");
		console.log("or --apply to rewrite them. Nothing was downloaded.");
		return;
	}

	console.log(
		`processing ${targets.length} object(s)${args.apply ? "" : " (sample, no writes)"}…\n`,
	);

	let done = 0;
	let skipped = 0;
	let failed = 0;
	let before = 0;
	let after = 0;
	const manifest: string[] = [];

	for (let i = 0; i < targets.length; i++) {
		const obj = targets[i];
		const label = `[${i + 1}/${targets.length}] ${obj.bucket}/${obj.path}`;
		try {
			const res = await processOne(supabase, obj, args, tmpDir);
			before += res.before;
			after += res.after;
			if (res.skipped) {
				skipped++;
				console.log(`${label} — skipped (${res.skipped})`);
			} else {
				done++;
				const pct = Math.round((1 - res.after / res.before) * 100);
				console.log(`${label} — ${kb(res.before)} → ${kb(res.after)} (-${pct}%)`);
				manifest.push(
					JSON.stringify({ ...obj, before: res.before, after: res.after, applied: args.apply }),
				);
			}
		} catch (err) {
			failed++;
			console.error(`${label} — FAILED: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	if (manifest.length > 0) {
		const manifestPath = path.join(args.backupDir, `manifest-${Date.now()}.jsonl`);
		await writeFile(manifestPath, `${manifest.join("\n")}\n`);
		console.log(`\nmanifest: ${manifestPath}`);
	}

	console.log(`\nre-encoded ${done}, skipped ${skipped}, failed ${failed}`);
	console.log(`bytes: ${mb(before)} → ${mb(after)}  (reclaimed ${mb(before - after)})`);

	if (!args.apply) {
		const ratio = before > 0 ? after / before : 1;
		console.log(`\nDRY RUN — nothing was written.`);
		console.log(
			`Measured ratio ${(ratio * 100).toFixed(1)}%; extrapolated over all ${all.length} eligible objects:`,
		);
		console.log(
			`  ${mb(totalBefore)} → ~${mb(totalBefore * ratio)} (reclaim ~${mb(totalBefore * (1 - ratio))})`,
		);
		console.log(`Re-run with --apply to perform it.`);
	}

	if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
