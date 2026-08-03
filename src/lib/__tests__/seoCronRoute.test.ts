import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/seo-sync/route";
import { runScheduledSync } from "@/lib/search-console/scheduled";

// The route's job is auth + delegation; the orchestration is tested separately.
vi.mock("@/lib/search-console/scheduled", () => ({
	runScheduledSync: vi.fn(),
}));

const SECRET = "test-cron-secret";

function request(authHeader?: string): Request {
	const headers = new Headers();
	if (authHeader) headers.set("authorization", authHeader);
	return new Request("http://localhost/api/cron/seo-sync", { headers });
}

// The handler only reads request.headers; a plain Request satisfies NextRequest here.
const asNextRequest = (r: Request) => r as unknown as Parameters<typeof GET>[0];

describe("GET /api/cron/seo-sync", () => {
	beforeEach(() => {
		process.env.CRON_SECRET = SECRET;
		vi.mocked(runScheduledSync).mockReset();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("401s when the Authorization header is missing", async () => {
		const res = await GET(asNextRequest(request()));
		expect(res.status).toBe(401);
		expect(runScheduledSync).not.toHaveBeenCalled();
	});

	it("401s on an incorrect secret", async () => {
		const res = await GET(asNextRequest(request("Bearer wrong")));
		expect(res.status).toBe(401);
		expect(runScheduledSync).not.toHaveBeenCalled();
	});

	it("401s when CRON_SECRET is not configured (even with a bearer)", async () => {
		process.env.CRON_SECRET = "";
		const res = await GET(asNextRequest(request("Bearer whatever")));
		expect(res.status).toBe(401);
		expect(runScheduledSync).not.toHaveBeenCalled();
	});

	it("runs the sync and returns 200 on success", async () => {
		vi.mocked(runScheduledSync).mockResolvedValue({
			window: { startDate: "2026-07-24", endDate: "2026-07-31" },
			results: [{ propertyId: "p1", status: "success", queryRowsSynced: 3 }],
			ok: true,
		});
		const res = await GET(asNextRequest(request(`Bearer ${SECRET}`)));
		expect(res.status).toBe(200);
		expect(runScheduledSync).toHaveBeenCalledTimes(1);
		await expect(res.json()).resolves.toMatchObject({ ok: true });
	});

	it("returns 500 when a property hard-failed", async () => {
		vi.mocked(runScheduledSync).mockResolvedValue({
			window: { startDate: "2026-07-24", endDate: "2026-07-31" },
			results: [{ propertyId: "p1", status: "failed", errorCode: "GOOGLE_API_ERROR" }],
			ok: false,
		});
		const res = await GET(asNextRequest(request(`Bearer ${SECRET}`)));
		expect(res.status).toBe(500);
	});

	it("returns a generic 500 (no leak) when orchestration throws", async () => {
		vi.mocked(runScheduledSync).mockRejectedValue(new Error("connection string leak?"));
		const res = await GET(asNextRequest(request(`Bearer ${SECRET}`)));
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(JSON.stringify(body)).not.toContain("connection string");
	});
});
