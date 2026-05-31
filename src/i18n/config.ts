/**
 * Locale config — single source of truth for supported languages.
 * IM Ops defaults to Bahasa Indonesia since the operators run a Jakarta-based
 * moving business; English is the alternate.
 */
export const LOCALES = ["id", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_COOKIE = "imops-locale";

export function isLocale(value: string | undefined | null): value is Locale {
	return value === "id" || value === "en";
}

/** Human-readable labels for the UI toggle. */
export const LOCALE_LABELS: Record<Locale, string> = {
	id: "Bahasa",
	en: "English",
};
