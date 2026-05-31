import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./config";

/**
 * Resolve the active locale on every request from our `imops-locale` cookie.
 *
 * No URL prefix — the app is auth-gated and operators flip language from the
 * TopBar toggle. Default falls through to Bahasa Indonesia.
 */
export default getRequestConfig(async () => {
	const cookieStore = await cookies();
	const raw = cookieStore.get(LOCALE_COOKIE)?.value;
	const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

	const messages = (await import(`../messages/${locale}.json`)).default;

	return {
		locale,
		messages,
	};
});
