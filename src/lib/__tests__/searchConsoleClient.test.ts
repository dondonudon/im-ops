import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_ROW_LIMIT,
	loadServiceAccountCredentials,
	normalizeErrorCode,
	queryAllSearchConsoleRows,
	querySearchConsole,
	SearchConsoleError,
} from "@/lib/search-console/client";
import type { SearchConsoleQueryInput, SearchConsoleRow } from "@/lib/search-console/types";

// GoogleAuth is mocked so no real credentials / network are needed. The token
// is asserted never to leak into thrown errors. `vi.hoisted` makes the constant
// available inside the hoisted `vi.mock` factory.
const { FAKE_TOKEN } = vi.hoisted(() => ({
	FAKE_TOKEN: "fake-access-token-should-never-leak",
}));
vi.mock("google-auth-library", () => ({
	// A class so `new GoogleAuth(...)` is a valid construct call.
	GoogleAuth: class {
		getClient() {
			return Promise.resolve({
				getAccessToken: () => Promise.resolve({ token: FAKE_TOKEN }),
			});
		}
	},
}));

const VALID_KEY = JSON.stringify({
	client_email: "svc@example.iam.gserviceaccount.com",
	private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
});

function row(overrides: Partial<SearchConsoleRow> = {}): SearchConsoleRow {
	return {
		keys: ["2026-07-01", "jasa pindah"],
		clicks: 1,
		impressions: 10,
		ctr: 0.1,
		position: 5,
		...overrides,
	};
}

/** Build N rows quickly for pagination tests. */
function rows(n: number): SearchConsoleRow[] {
	return Array.from({ length: n }, () => row());
}

// ---------------------------------------------------------------------------
// loadServiceAccountCredentials
// ---------------------------------------------------------------------------
describe("loadServiceAccountCredentials", () => {
	const original = process.env.GSC_SERVICE_ACCOUNT_KEY;
	afterEach(() => {
		if (original === undefined) delete process.env.GSC_SERVICE_ACCOUNT_KEY;
		else process.env.GSC_SERVICE_ACCOUNT_KEY = original;
	});

	it("throws MISSING_CONFIGURATION when the env var is absent", () => {
		delete process.env.GSC_SERVICE_ACCOUNT_KEY;
		try {
			loadServiceAccountCredentials();
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(SearchConsoleError);
			expect((err as SearchConsoleError).code).toBe("MISSING_CONFIGURATION");
		}
	});

	it("throws INVALID_CREDENTIALS on malformed JSON", () => {
		process.env.GSC_SERVICE_ACCOUNT_KEY = "{not json";
		expect(() => loadServiceAccountCredentials()).toThrowError(SearchConsoleError);
		try {
			loadServiceAccountCredentials();
		} catch (err) {
			expect((err as SearchConsoleError).code).toBe("INVALID_CREDENTIALS");
		}
	});

	it("throws INVALID_CREDENTIALS when required fields are missing", () => {
		process.env.GSC_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: "x@y.z" });
		try {
			loadServiceAccountCredentials();
		} catch (err) {
			expect((err as SearchConsoleError).code).toBe("INVALID_CREDENTIALS");
		}
	});

	it("returns the parsed key when valid", () => {
		process.env.GSC_SERVICE_ACCOUNT_KEY = VALID_KEY;
		const key = loadServiceAccountCredentials();
		expect(key.client_email).toBe("svc@example.iam.gserviceaccount.com");
		expect(key.private_key).toContain("BEGIN PRIVATE KEY");
	});
});

// ---------------------------------------------------------------------------
// normalizeErrorCode
// ---------------------------------------------------------------------------
describe("normalizeErrorCode", () => {
	it.each([
		[401, "INVALID_CREDENTIALS"],
		[403, "UNAUTHORIZED_PROPERTY"],
		[429, "RATE_LIMITED"],
		[500, "GOOGLE_API_ERROR"],
		[503, "GOOGLE_API_ERROR"],
		[400, "UNKNOWN"],
		[404, "UNKNOWN"],
	] as const)("maps %i → %s (no detail)", (status, code) => {
		expect(normalizeErrorCode(status)).toBe(code);
	});

	it("distinguishes a 403 'API disabled' from a permission 403 via the body", () => {
		expect(
			normalizeErrorCode(
				403,
				"Google Search Console API has not been used in project 123 or it is disabled",
			),
		).toBe("API_DISABLED");
		expect(normalizeErrorCode(403, "User does not have sufficient permission for site")).toBe(
			"UNAUTHORIZED_PROPERTY",
		);
	});
});

// ---------------------------------------------------------------------------
// querySearchConsole (mocked fetch + GoogleAuth)
// ---------------------------------------------------------------------------
describe("querySearchConsole", () => {
	beforeEach(() => {
		process.env.GSC_SERVICE_ACCOUNT_KEY = VALID_KEY;
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const input = {
		siteUrl: "sc-domain:indo-mover.com",
		startDate: "2026-07-01",
		endDate: "2026-07-28",
		dimensions: ["date", "query"],
	} satisfies SearchConsoleQueryInput;

	it("posts to the encoded endpoint with web type and returns parsed rows", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ rows: [row()] }),
		})) as unknown as typeof fetch;
		vi.stubGlobal("fetch", fetchMock);

		const res = await querySearchConsole({ ...input });

		expect(res.rows).toHaveLength(1);
		const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		// Colon in sc-domain: must be percent-encoded.
		expect(url).toContain("sc-domain%3Aindo-mover.com/searchAnalytics/query");
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.type).toBe("web");
		expect(body.dataState).toBe("all");
		expect(body.rowLimit).toBe(DEFAULT_ROW_LIMIT);
		expect((init as RequestInit).headers).toMatchObject({
			Authorization: `Bearer ${FAKE_TOKEN}`,
		});
	});

	it.each([
		[401, "INVALID_CREDENTIALS"],
		[403, "UNAUTHORIZED_PROPERTY"],
		[429, "RATE_LIMITED"],
		[500, "GOOGLE_API_ERROR"],
	] as const)("throws normalized %i → %s and never leaks the token", async (status, code) => {
		const fetchMock = vi.fn(async () => ({
			ok: false,
			status,
			text: async () => "google error detail",
		})) as unknown as typeof fetch;
		vi.stubGlobal("fetch", fetchMock);

		try {
			await querySearchConsole({ ...input });
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(SearchConsoleError);
			expect((err as SearchConsoleError).code).toBe(code);
			expect((err as SearchConsoleError).status).toBe(status);
			expect((err as SearchConsoleError).message).not.toContain(FAKE_TOKEN);
		}
	});
});

// ---------------------------------------------------------------------------
// queryAllSearchConsoleRows (pagination via injected fetchPage)
// ---------------------------------------------------------------------------
describe("queryAllSearchConsoleRows", () => {
	const baseInput = {
		siteUrl: "s",
		startDate: "a",
		endDate: "b",
		dimensions: ["query"],
		rowLimit: 10,
	} satisfies Omit<SearchConsoleQueryInput, "startRow">;

	it("returns a single short page and stops", async () => {
		const fetchPage = vi.fn(async () => rows(3));
		const result = await queryAllSearchConsoleRows({ ...baseInput }, { fetchPage });
		expect(result).toHaveLength(3);
		expect(fetchPage).toHaveBeenCalledTimes(1);
		expect(fetchPage).toHaveBeenCalledWith(0);
	});

	it("paginates across a full page then a short page", async () => {
		const fetchPage = vi
			.fn<(startRow: number) => Promise<SearchConsoleRow[]>>()
			.mockResolvedValueOnce(rows(10)) // full → continue
			.mockResolvedValueOnce(rows(4)); // short → stop
		const result = await queryAllSearchConsoleRows({ ...baseInput }, { fetchPage });
		expect(result).toHaveLength(14);
		expect(fetchPage).toHaveBeenCalledTimes(2);
		expect(fetchPage).toHaveBeenNthCalledWith(2, 10); // startRow advances by pageSize
	});

	it("stops at the maxPages cap even if pages stay full", async () => {
		const fetchPage = vi.fn(async () => rows(10));
		const result = await queryAllSearchConsoleRows({ ...baseInput }, { fetchPage, maxPages: 3 });
		expect(result).toHaveLength(30);
		expect(fetchPage).toHaveBeenCalledTimes(3);
	});

	it("returns an empty array when the first page is empty", async () => {
		const fetchPage = vi.fn(async () => [] as SearchConsoleRow[]);
		const result = await queryAllSearchConsoleRows({ ...baseInput }, { fetchPage });
		expect(result).toHaveLength(0);
		expect(fetchPage).toHaveBeenCalledTimes(1);
	});
});
