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
