/**
 * Google Search Console — Search Analytics API types.
 * Shared by the client, the sync service, and the dashboard queries.
 */

export type SearchConsoleDimension =
	| "date"
	| "query"
	| "page"
	| "country"
	| "device"
	| "searchAppearance";

export type SearchConsoleSearchType =
	| "web"
	| "image"
	| "video"
	| "news"
	| "discover"
	| "googleNews";

/** A single row as returned by the Search Analytics API. */
export type SearchConsoleRow = {
	/** Values line up positionally with the requested `dimensions`. */
	keys?: string[];
	clicks: number;
	impressions: number;
	ctr: number;
	position: number;
};

export type SearchConsoleResponse = {
	rows?: SearchConsoleRow[];
	responseAggregationType?: string;
};

export type SearchConsoleQueryInput = {
	/** e.g. "sc-domain:indo-mover.com" — encoded by the client. */
	siteUrl: string;
	/** Plain YYYY-MM-DD (never round-trip through a JS Date / UTC). */
	startDate: string;
	endDate: string;
	dimensions: SearchConsoleDimension[];
	/** Defaults to "web". */
	searchType?: SearchConsoleSearchType;
	/** "all" includes freshest finalized data; "final" is the stable subset. */
	dataState?: "final" | "all";
	rowLimit?: number;
	startRow?: number;
};

/** Normalized categories so callers/UI never depend on raw Google errors. */
export type SearchConsoleErrorCode =
	| "MISSING_CONFIGURATION"
	| "INVALID_CREDENTIALS"
	| "API_DISABLED"
	| "UNAUTHORIZED_PROPERTY"
	| "RATE_LIMITED"
	| "GOOGLE_API_ERROR"
	| "UNKNOWN";

/** Minimal shape of a Google service-account key JSON. */
export type ServiceAccountKey = {
	client_email: string;
	private_key: string;
	[key: string]: unknown;
};
