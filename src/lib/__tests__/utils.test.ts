import { describe, expect, it } from "vitest";
import {
	buildWhatsAppLink,
	capitalizeWords,
	formatJobSchedule,
	formatRupiah,
	mapDbError,
	parseRupiah,
	sanitizeSearch,
	toRomanMonth,
	truncate,
} from "@/lib/utils";

// ---------------------------------------------------------------------------
// formatRupiah / parseRupiah
// ---------------------------------------------------------------------------
describe("formatRupiah", () => {
	it("formats zero", () => {
		expect(formatRupiah(0)).toMatch(/0/);
	});

	it("formats a positive integer with IDR symbol", () => {
		const result = formatRupiah(1_500_000);
		expect(result).toMatch(/1\.500\.000/); // id-ID uses . as thousand separator
		expect(result).toMatch(/Rp|IDR/);
	});

	it("formats a large value", () => {
		const result = formatRupiah(25_000_000);
		expect(result).toMatch(/25\.000\.000/);
	});
});

describe("parseRupiah", () => {
	it("parses a formatted string back to a number", () => {
		expect(parseRupiah("1.500.000")).toBe(1_500_000);
	});

	it("strips currency symbol", () => {
		expect(parseRupiah("Rp 2.000.000")).toBe(2_000_000);
	});

	it("returns 0 for empty string", () => {
		expect(parseRupiah("")).toBe(0);
	});

	it("returns 0 for non-numeric string", () => {
		expect(parseRupiah("abc")).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// toRomanMonth
// ---------------------------------------------------------------------------
describe("toRomanMonth", () => {
	const cases: [number, string][] = [
		[1, "I"],
		[2, "II"],
		[3, "III"],
		[4, "IV"],
		[5, "V"],
		[6, "VI"],
		[7, "VII"],
		[8, "VIII"],
		[9, "IX"],
		[10, "X"],
		[11, "XI"],
		[12, "XII"],
	];

	it.each(cases)("month %i → %s", (month, expected) => {
		expect(toRomanMonth(month)).toBe(expected);
	});
});

// ---------------------------------------------------------------------------
// capitalizeWords
// ---------------------------------------------------------------------------
describe("capitalizeWords", () => {
	it("capitalizes first letter of each word", () => {
		expect(capitalizeWords("budi setiawan")).toBe("Budi Setiawan");
	});

	it("handles single word", () => {
		expect(capitalizeWords("jakarta")).toBe("Jakarta");
	});

	it("preserves already-capitalized words", () => {
		expect(capitalizeWords("PT Indo Mover")).toBe("PT Indo Mover");
	});

	it("returns empty string unchanged", () => {
		expect(capitalizeWords("")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------
describe("truncate", () => {
	it("returns the string unchanged when within limit", () => {
		expect(truncate("hello", 10)).toBe("hello");
	});

	it("truncates and appends ellipsis when over limit", () => {
		const result = truncate("abcdefgh", 5);
		expect(result).toHaveLength(5);
		expect(result.endsWith("…")).toBe(true);
	});

	it("does not truncate at exact limit", () => {
		expect(truncate("hello", 5)).toBe("hello");
	});
});

// ---------------------------------------------------------------------------
// sanitizeSearch  — security-critical: prevents PostgREST filter injection
// ---------------------------------------------------------------------------
describe("sanitizeSearch", () => {
	it("strips PostgREST metacharacters ( ) ,", () => {
		const result = sanitizeSearch("foo(bar),baz");
		expect(result).not.toMatch(/[(),]/);
	});

	it("escapes ILIKE wildcard %", () => {
		expect(sanitizeSearch("50%")).toContain("\\%");
	});

	it("escapes ILIKE wildcard _", () => {
		expect(sanitizeSearch("hello_world")).toContain("\\_");
	});

	it("escapes backslash", () => {
		expect(sanitizeSearch("back\\slash")).toContain("\\\\");
	});

	it("trims leading/trailing whitespace", () => {
		expect(sanitizeSearch("  hello  ")).toBe("hello");
	});

	it("leaves a safe search term unchanged", () => {
		expect(sanitizeSearch("Indo Mover")).toBe("Indo Mover");
	});

	it("neutralises a filter-injection attempt: .or() breakout via parens", () => {
		// Input: `foo).or(1.eq.1`  → should become `foo .or 1.eq.1` (parens replaced)
		const result = sanitizeSearch("foo).or(1.eq.1");
		expect(result).not.toMatch(/[()]/);
	});
});

// ---------------------------------------------------------------------------
// mapDbError
// ---------------------------------------------------------------------------
describe("mapDbError", () => {
	it("maps unique-violation code 23505 to a friendly message", () => {
		const result = mapDbError({ code: "23505" });
		expect(result).toMatch(/already exists/i);
	});

	it("returns a generic message for unknown errors", () => {
		expect(mapDbError(new Error("network failure"))).toMatch(/unexpected error/i);
	});

	it("returns a generic message for non-object errors", () => {
		expect(mapDbError("oops")).toMatch(/unexpected error/i);
	});

	it("returns a generic message for null", () => {
		expect(mapDbError(null)).toMatch(/unexpected error/i);
	});
});

// ---------------------------------------------------------------------------
// buildWhatsAppLink
// ---------------------------------------------------------------------------
describe("buildWhatsAppLink", () => {
	it("strips non-numeric characters from phone", () => {
		const url = buildWhatsAppLink("+62 812-3456-7890", "hello");
		expect(url).toContain("6281234567890");
	});

	it("URL-encodes the message text", () => {
		const url = buildWhatsAppLink("6281234", "hello world");
		expect(url).toContain("hello%20world");
	});

	it("starts with the WhatsApp wa.me domain", () => {
		expect(buildWhatsAppLink("6281234", "test")).toMatch(/^https:\/\/wa\.me\//);
	});
});

// ---------------------------------------------------------------------------
// formatJobSchedule
// ---------------------------------------------------------------------------
describe("formatJobSchedule", () => {
	it("formats a single day with time", () => {
		const result = formatJobSchedule("2026-06-15", "08:00", null);
		expect(result).toContain("08:00");
		expect(result).toContain("2026");
	});

	it("formats a multi-day range without time", () => {
		const result = formatJobSchedule("2026-06-15", null, "2026-06-17");
		expect(result).toContain("–");
	});

	it("formats a single day without time", () => {
		const result = formatJobSchedule("2026-06-15", null, null);
		expect(result).not.toContain("–");
		expect(result).not.toContain("·");
	});

	it("does not show range when end date equals start date", () => {
		const result = formatJobSchedule("2026-06-15", "09:00", "2026-06-15");
		expect(result).not.toContain("–");
		expect(result).toContain("09:00");
	});
});
