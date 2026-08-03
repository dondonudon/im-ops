import "server-only";

import { GoogleAuth } from "google-auth-library";
import type {
	SearchConsoleErrorCode,
	SearchConsoleQueryInput,
	SearchConsoleResponse,
	SearchConsoleRow,
	ServiceAccountKey,
} from "./types";

/**
 * Google Search Console — Search Analytics API client (server-only).
 *
 * Mirrors the auth approach proven in `src/lib/gcal/sync.ts`: a service-account
 * key → GoogleAuth → short-lived access token → raw `fetch`. Read-only scope.
 *
 * @security Never log the access token, the Authorization header, or the raw
 * service-account key. Errors are normalized (SearchConsoleError) so credential
 * material never reaches callers, logs, or the UI.
 */

const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const SEARCH_CONSOLE_BASE = "https://www.googleapis.com/webmasters/v3/sites";

/** Search Analytics allows up to 25,000 rows per request. */
export const DEFAULT_ROW_LIMIT = 25_000;
/** Defensive cap so a runaway response can't loop forever. Right-sized for a
 * single small property; raise if a property genuinely exceeds ~125k rows. */
export const DEFAULT_MAX_PAGES = 5;

export class SearchConsoleError extends Error {
	readonly code: SearchConsoleErrorCode;
	readonly status?: number;

	constructor(code: SearchConsoleErrorCode, message: string, status?: number) {
		super(message);
		this.name = "SearchConsoleError";
		this.code = code;
		this.status = status;
	}
}

/** Parse + validate the service-account key from the environment. */
export function loadServiceAccountCredentials(): ServiceAccountKey {
	const raw = process.env.GSC_SERVICE_ACCOUNT_KEY;
	if (!raw) {
		throw new SearchConsoleError(
			"MISSING_CONFIGURATION",
			"GSC_SERVICE_ACCOUNT_KEY is not configured",
		);
	}

	let parsed: ServiceAccountKey;
	try {
		parsed = JSON.parse(raw) as ServiceAccountKey;
	} catch {
		throw new SearchConsoleError(
			"INVALID_CREDENTIALS",
			"GSC_SERVICE_ACCOUNT_KEY contains invalid JSON",
		);
	}

	if (!parsed.client_email || !parsed.private_key) {
		throw new SearchConsoleError(
			"INVALID_CREDENTIALS",
			"GSC_SERVICE_ACCOUNT_KEY is missing client_email or private_key",
		);
	}
	return parsed;
}

/**
 * Map an HTTP status (and optional error body) into a normalized code. A 403
 * has two distinct causes that the body disambiguates: the Search Console API
 * being disabled in the Cloud project vs. the service account lacking access to
 * the property.
 */
export function normalizeErrorCode(status: number, detail?: string): SearchConsoleErrorCode {
	if (status === 401) return "INVALID_CREDENTIALS";
	if (status === 403) {
		const disabled =
			detail !== undefined &&
			/has not been used in project|is disabled|accessNotConfigured|SERVICE_DISABLED|serviceusage/i.test(
				detail,
			);
		return disabled ? "API_DISABLED" : "UNAUTHORIZED_PROPERTY";
	}
	if (status === 429) return "RATE_LIMITED";
	return status >= 500 ? "GOOGLE_API_ERROR" : "UNKNOWN";
}

async function getAccessToken(): Promise<string> {
	const auth = new GoogleAuth({
		credentials: loadServiceAccountCredentials(),
		scopes: [SEARCH_CONSOLE_SCOPE],
	});
	const client = await auth.getClient();
	const token = await client.getAccessToken();
	if (!token.token) {
		throw new SearchConsoleError(
			"INVALID_CREDENTIALS",
			"Failed to obtain a Search Console access token",
		);
	}
	return token.token;
}

/** Read a short, credential-free snippet of a Google error body for context. */
async function readErrorDetail(res: Response): Promise<string> {
	try {
		const text = await res.text();
		return text.slice(0, 200);
	} catch {
		return "";
	}
}

/** Execute a single Search Analytics query (one page). */
export async function querySearchConsole(
	input: SearchConsoleQueryInput,
): Promise<SearchConsoleResponse> {
	const token = await getAccessToken();
	const endpoint = `${SEARCH_CONSOLE_BASE}/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`;

	const res = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			startDate: input.startDate,
			endDate: input.endDate,
			dimensions: input.dimensions,
			type: input.searchType ?? "web",
			dataState: input.dataState ?? "all",
			rowLimit: input.rowLimit ?? DEFAULT_ROW_LIMIT,
			startRow: input.startRow ?? 0,
		}),
	});

	if (!res.ok) {
		const detail = await readErrorDetail(res);
		throw new SearchConsoleError(
			normalizeErrorCode(res.status, detail),
			`Search Console API error (${res.status})${detail ? `: ${detail}` : ""}`,
			res.status,
		);
	}

	return (await res.json()) as SearchConsoleResponse;
}

/**
 * Fetch every row for a query, paginating until a short page is returned or the
 * page cap is hit.
 *
 * `options.fetchPage` is injectable so the pagination loop can be unit-tested
 * without touching Google auth or the network.
 */
export async function queryAllSearchConsoleRows(
	input: Omit<SearchConsoleQueryInput, "startRow">,
	options: {
		maxPages?: number;
		fetchPage?: (startRow: number) => Promise<SearchConsoleRow[]>;
	} = {},
): Promise<SearchConsoleRow[]> {
	const pageSize = input.rowLimit ?? DEFAULT_ROW_LIMIT;
	const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
	const fetchPage =
		options.fetchPage ??
		(async (startRow: number) => {
			const res = await querySearchConsole({ ...input, rowLimit: pageSize, startRow });
			return res.rows ?? [];
		});

	const rows: SearchConsoleRow[] = [];
	for (let page = 0; page < maxPages; page++) {
		const pageRows = await fetchPage(page * pageSize);
		rows.push(...pageRows);
		if (pageRows.length < pageSize) break;
	}
	return rows;
}
