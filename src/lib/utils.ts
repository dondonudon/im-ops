import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts. */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Format a number as Indonesian Rupiah. */
export function formatRupiah(value: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(value);
}

/** Parse a thousand-separated IDR string back to a number. */
export function parseRupiah(value: string): number {
	return (
		Number(
			value
				.replace(/\./g, "")
				.replace(/,/g, "")
				.replace(/[^0-9]/g, ""),
		) || 0
	);
}

/** Convert a Roman numeral month to a number (I=1 … XII=12). */
const ROMAN_MONTHS = [
	"I",
	"II",
	"III",
	"IV",
	"V",
	"VI",
	"VII",
	"VIII",
	"IX",
	"X",
	"XI",
	"XII",
] as const;

/** Get the Roman numeral for a month number (1-based). */
export function toRomanMonth(month: number): string {
	return ROMAN_MONTHS[month - 1];
}

/** Capitalize the first letter after every word boundary (for name inputs). */
export function capitalizeWords(value: string): string {
	return value.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/** Truncate text with ellipsis. */
export function truncate(str: string, maxLen: number): string {
	return str.length <= maxLen ? str : `${str.slice(0, maxLen - 1)}…`;
}

/** Format a date string or Date as "DD MMM YYYY". */
export function formatDate(date: string | Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(typeof date === "string" ? new Date(date) : date);
}

/**
 * Format a TIME string ("HH:MM:SS" or "HH:MM") to "HH:MM" display (24-hour).
 * Returns null when the value is null/empty.
 */
export function formatTime(time: string | null | undefined): string | null {
	if (!time) return null;
	// Postgres TIME comes as "HH:MM:SS" — return just "HH:MM"
	return time.slice(0, 5);
}

/**
 * Format a job's date range for display.
 * - Single day with time: "26 May 2026 · 08:00"
 * - Multi-day: "26 May – 28 May 2026"
 * - Single day no time: "26 May 2026"
 */
export function formatJobSchedule(
	moveDate: string,
	moveTime: string | null | undefined,
	moveEndDate: string | null | undefined,
): string {
	const start = formatDate(moveDate);
	if (moveEndDate && moveEndDate !== moveDate) {
		const end = formatDate(moveEndDate);
		return `${start} – ${end}`;
	}
	const time = formatTime(moveTime);
	return time ? `${start} · ${time}` : start;
}

/** Resize and convert an image File to a WebP Blob (client-side). */
export async function resizeImage(file: File, maxPx = 1600): Promise<Blob> {
	const img = await createImageBitmap(file);
	const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(img.width * ratio);
	canvas.height = Math.round(img.height * ratio);
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("Image conversion failed"))),
			"image/webp",
			0.82,
		);
	});
}

/** Max size for an uploaded (or re-encoded) evidence video. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** True when a File is a video, based on its MIME type. */
export function isVideoFile(file: File): boolean {
	return file.type.startsWith("video/");
}

/** Thrown when a video can't be brought under MAX_VIDEO_BYTES for upload. */
export class VideoTooLargeError extends Error {
	constructor(message = "Video exceeds the size limit") {
		super(message);
		this.name = "VideoTooLargeError";
	}
}

const VIDEO_MIME_TO_EXT: Record<string, string> = {
	"video/mp4": "mp4",
	"video/quicktime": "mov",
	"video/webm": "webm",
	"video/x-matroska": "mkv",
	"video/3gpp": "3gp",
	"video/ogg": "ogv",
};

function videoExtFor(file: File): string {
	const fromName = file.name.split(".").pop()?.toLowerCase();
	if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/.test(fromName)) return fromName;
	return VIDEO_MIME_TO_EXT[file.type] ?? "mp4";
}

/** Pick the first MediaRecorder-supported WebM codec, or null if none. */
function pickVideoMimeType(): string | null {
	if (typeof MediaRecorder === "undefined") return null;
	const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
	for (const c of candidates) {
		if (MediaRecorder.isTypeSupported?.(c)) return c;
	}
	return null;
}

/**
 * Best-effort client-side downscale + re-encode of an oversized video, in real
 * time, via canvas capture + MediaRecorder. Scales the longest edge down to
 * `maxPx` and targets an adaptive bitrate so the whole clip fits under
 * MAX_VIDEO_BYTES. Returns null when the browser can't re-encode (no
 * MediaRecorder / captureStream / supported codec).
 *
 * NOTE: audio is captured from the muted source element; a few browsers emit a
 * silent audio track in this path. This only affects clips large enough to need
 * re-encoding — anything under the cap uploads untouched with full audio.
 */
async function downscaleVideo(file: File, maxPx = 1080): Promise<Blob | null> {
	const mimeType = pickVideoMimeType();
	if (!mimeType) return null;

	const video = document.createElement("video");
	video.muted = true;
	video.playsInline = true;
	const url = URL.createObjectURL(file);
	video.src = url;

	try {
		await new Promise<void>((resolve, reject) => {
			video.onloadedmetadata = () => resolve();
			video.onerror = () => reject(new Error("Video failed to load"));
		});

		const duration = video.duration;
		const { videoWidth, videoHeight } = video;
		if (!Number.isFinite(duration) || duration <= 0 || !videoWidth || !videoHeight) return null;

		const scale = Math.min(maxPx / videoWidth, maxPx / videoHeight, 1);
		const width = Math.round(videoWidth * scale);
		const height = Math.round(videoHeight * scale);

		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;

		const capture = (
			canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }
		).captureStream;
		if (!capture) return null;
		const canvasStream = capture.call(canvas, 30);

		const srcCapture = video as HTMLVideoElement & {
			captureStream?: () => MediaStream;
			mozCaptureStream?: () => MediaStream;
		};
		const srcStream = srcCapture.captureStream?.() ?? srcCapture.mozCaptureStream?.();
		const audioTracks = srcStream?.getAudioTracks() ?? [];
		const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

		const AUDIO_BPS = audioTracks.length > 0 ? 128_000 : 0;
		// Target 90% of the cap across the whole clip, leaving headroom for the
		// audio track + container overhead; clamp to a sane range.
		const targetTotalBits = MAX_VIDEO_BYTES * 8 * 0.9;
		let videoBps = Math.floor(targetTotalBits / duration) - AUDIO_BPS;
		videoBps = Math.max(500_000, Math.min(videoBps, 8_000_000));

		const recorder = new MediaRecorder(combined, {
			mimeType,
			videoBitsPerSecond: videoBps,
			...(AUDIO_BPS ? { audioBitsPerSecond: AUDIO_BPS } : {}),
		});
		const chunks: Blob[] = [];
		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};
		const recorded = new Promise<Blob>((resolve) => {
			recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
		});

		let raf = 0;
		const drawFrame = () => {
			if (video.ended || video.paused) return;
			ctx.drawImage(video, 0, 0, width, height);
			raf = requestAnimationFrame(drawFrame);
		};

		recorder.start(1000);
		await video.play();
		drawFrame();
		await new Promise<void>((resolve) => {
			video.onended = () => resolve();
		});
		cancelAnimationFrame(raf);
		if (recorder.state !== "inactive") recorder.stop();
		return await recorded;
	} catch {
		return null;
	} finally {
		URL.revokeObjectURL(url);
	}
}

/**
 * Prepares a video File for upload (client-side), honoring MAX_VIDEO_BYTES.
 * - Under the cap: returns the file unchanged — no re-encode, no quality loss.
 * - Over the cap: best-effort downscale to <=1080p at an adaptive bitrate.
 * Throws VideoTooLargeError if the result is still over the cap or the browser
 * can't re-encode.
 */
export async function prepareVideoUpload(
	file: File,
): Promise<{ blob: Blob; ext: string; contentType: string }> {
	if (file.size <= MAX_VIDEO_BYTES) {
		return { blob: file, ext: videoExtFor(file), contentType: file.type || "video/mp4" };
	}
	const blob = await downscaleVideo(file);
	if (!blob || blob.size > MAX_VIDEO_BYTES) {
		throw new VideoTooLargeError();
	}
	return { blob, ext: "webm", contentType: "video/webm" };
}

/**
 * Sanitize a user-supplied search term for safe use inside a PostgREST
 * `.or()` / `.ilike()` filter string.
 *
 * - Strips PostgREST-meaningful characters (`(` `)` `,`) that would otherwise
 *   let a search term break out of its filter and inject arbitrary conditions.
 * - Escapes ILIKE wildcards (`%` `_`) and the escape char (`\`) so they match
 *   literally instead of acting as wildcards.
 *
 * Always wrap the result in `%…%` yourself, e.g. `name.ilike.%${safe}%`.
 */
export function sanitizeSearch(input: string): string {
	return input
		.replace(/[(),]/g, " ")
		.replace(/[\\%_]/g, "\\$&")
		.trim();
}

/** Map a Supabase/Postgres error to a safe user-facing message. */
export function mapDbError(err: unknown): string {
	if (err && typeof err === "object" && "code" in err) {
		const { code } = err as { code: string };
		if (code === "23505") return "A record with this value already exists.";
	}
	return "An unexpected error occurred. Please try again.";
}

/** Build a WhatsApp deeplink URL with pre-filled text. */
export function buildWhatsAppLink(phone: string, message: string): string {
	// Strip non-numeric chars, ensure leading country code
	const cleaned = phone.replace(/\D/g, "");
	const encoded = encodeURIComponent(message);
	return `https://wa.me/${cleaned}?text=${encoded}`;
}

const INDONESIAN_MONTHS = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];

/** Format a date string as Indonesian date, e.g. "11 Mei 2026". */
export function formatIndonesianDate(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getDate()} ${INDONESIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Format a number as "Rp 6.000.000,-" for use in Indonesian formal documents. */
export function formatRupiahLetter(amount: number): string {
	const formatted = Math.round(amount)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	return `Rp ${formatted},-`;
}

/** Convert a non-negative integer to Indonesian words (e.g. 6000000 → "enam juta"). */
export function numberToIndonesianWords(n: number): string {
	if (n === 0) return "nol";
	const ones = [
		"",
		"satu",
		"dua",
		"tiga",
		"empat",
		"lima",
		"enam",
		"tujuh",
		"delapan",
		"sembilan",
		"sepuluh",
		"sebelas",
		"dua belas",
		"tiga belas",
		"empat belas",
		"lima belas",
		"enam belas",
		"tujuh belas",
		"delapan belas",
		"sembilan belas",
	];

	function below1000(x: number): string {
		if (x < 20) return ones[x];
		if (x < 100) {
			const t = Math.floor(x / 10),
				r = x % 10;
			return `${ones[t]} puluh${r ? ` ${ones[r]}` : ""}`;
		}
		const h = Math.floor(x / 100),
			r = x % 100;
		const prefix = h === 1 ? "seratus" : `${ones[h]} ratus`;
		return `${prefix}${r ? ` ${below1000(r)}` : ""}`;
	}

	if (n < 1000) return below1000(n);
	if (n < 1_000_000) {
		const t = Math.floor(n / 1000),
			r = n % 1000;
		const prefix = t === 1 ? "seribu" : `${below1000(t)} ribu`;
		return `${prefix}${r ? ` ${below1000(r)}` : ""}`;
	}
	if (n < 1_000_000_000) {
		const m = Math.floor(n / 1_000_000),
			r = n % 1_000_000;
		const prefix = `${below1000(m)} juta`;
		if (r === 0) return prefix;
		if (r < 1000) return `${prefix} ${below1000(r)}`;
		const t = Math.floor(r / 1000),
			rem = r % 1000;
		const tPrefix = t === 1 ? "seribu" : `${below1000(t)} ribu`;
		return `${prefix} ${tPrefix}${rem ? ` ${below1000(rem)}` : ""}`;
	}
	const b = Math.floor(n / 1_000_000_000),
		r = n % 1_000_000_000;
	return `${below1000(b)} miliar${r ? ` ${numberToIndonesianWords(r)}` : ""}`;
}

export function formatCustomerName(prefix: string | null | undefined, name: string): string {
	return prefix ? `${prefix}. ${name}` : name;
}

export function todayInJakarta(): string {
	return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export type DerivedJobStatus = "upcoming" | "today" | "done" | "cancelled";

export function deriveJobStatus(moveDate: string | null, dbStatus: string): DerivedJobStatus {
	if (dbStatus === "cancelled") return "cancelled";
	if (!moveDate) return "upcoming";
	const today = todayInJakarta();
	if (moveDate < today) return "done";
	if (moveDate === today) return "today";
	return "upcoming";
}
