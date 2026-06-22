import { describe, expect, it } from "vitest";
import {
	type CustomerDuplicate,
	findDuplicateCustomer,
	formatCustomerLabel,
} from "@/lib/customerDuplicates";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCustomer(overrides: Partial<CustomerDuplicate> = {}): CustomerDuplicate {
	return {
		id: "uuid-1",
		prefix: null,
		name: "Budi Setiawan",
		phone: "08123456789",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// formatCustomerLabel
// ---------------------------------------------------------------------------
describe("formatCustomerLabel", () => {
	it("includes prefix when present", () => {
		expect(formatCustomerLabel({ prefix: "Mr", name: "Budi", phone: null })).toBe("Mr. Budi");
	});

	it("omits prefix when null", () => {
		expect(formatCustomerLabel({ prefix: null, name: "Sari", phone: null })).toBe("Sari");
	});

	it("appends phone in parentheses when present", () => {
		const result = formatCustomerLabel({ prefix: null, name: "Sari", phone: "08111" });
		expect(result).toBe("Sari (08111)");
	});

	it("combines prefix, name and phone", () => {
		const result = formatCustomerLabel({ prefix: "Mrs", name: "Dewi", phone: "08999" });
		expect(result).toBe("Mrs. Dewi (08999)");
	});
});

// ---------------------------------------------------------------------------
// findDuplicateCustomer — phone matching
// ---------------------------------------------------------------------------
describe("findDuplicateCustomer – phone matching", () => {
	const customers: CustomerDuplicate[] = [
		makeCustomer({ id: "a", name: "Budi", phone: "08123456789" }),
		makeCustomer({ id: "b", name: "Sari", phone: "08987654321" }),
	];

	it("matches by exact phone number", () => {
		const result = findDuplicateCustomer(customers, {
			name: "Someone Else",
			phone: "08123456789",
		});
		expect(result?.id).toBe("a");
	});

	it("normalises +62 prefix to 0", () => {
		const result = findDuplicateCustomer(customers, {
			name: "N/A",
			phone: "+628123456789",
		});
		expect(result?.id).toBe("a");
	});

	it("normalises 62 prefix (without +) to 0", () => {
		const result = findDuplicateCustomer(customers, {
			name: "N/A",
			phone: "628123456789",
		});
		expect(result?.id).toBe("a");
	});

	it("normalises bare 8x subscriber number to 0", () => {
		const result = findDuplicateCustomer(customers, {
			name: "N/A",
			phone: "8123456789",
		});
		expect(result?.id).toBe("a");
	});

	it("returns null when no phone matches", () => {
		const result = findDuplicateCustomer(customers, {
			name: "N/A",
			phone: "09999999999",
		});
		expect(result).toBeNull();
	});

	it("returns null when phone is empty string", () => {
		const result = findDuplicateCustomer(customers, { name: "Budi", phone: "" });
		// Empty phone falls through to name matching — Budi should match by name
		expect(result?.id).toBe("a");
	});
});

// ---------------------------------------------------------------------------
// findDuplicateCustomer — name matching (fallback when no phone provided)
// ---------------------------------------------------------------------------
describe("findDuplicateCustomer – name matching", () => {
	const customers: CustomerDuplicate[] = [
		makeCustomer({ id: "a", name: "Budi Setiawan", phone: null }),
		makeCustomer({ id: "b", name: "PT Indo Mover", phone: null }),
	];

	it("matches by exact name (case-insensitive)", () => {
		const result = findDuplicateCustomer(customers, { name: "budi setiawan" });
		expect(result?.id).toBe("a");
	});

	it("matches by name ignoring extra spaces", () => {
		const result = findDuplicateCustomer(customers, { name: "  Budi  Setiawan  " });
		expect(result?.id).toBe("a");
	});

	it("returns null for a different name", () => {
		const result = findDuplicateCustomer(customers, { name: "Sari Dewi" });
		expect(result).toBeNull();
	});

	it("returns null for an empty name", () => {
		const result = findDuplicateCustomer(customers, { name: "" });
		expect(result).toBeNull();
	});

	it("skips name matching when phone is provided but non-empty", () => {
		// Phone given but doesn't match → should NOT fall through to name match
		const result = findDuplicateCustomer(customers, {
			name: "Budi Setiawan",
			phone: "09999999999",
		});
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// findDuplicateCustomer — empty customer list
// ---------------------------------------------------------------------------
describe("findDuplicateCustomer – edge cases", () => {
	it("returns null when customer list is empty", () => {
		expect(findDuplicateCustomer([], { name: "Anyone", phone: "08111" })).toBeNull();
	});
});
