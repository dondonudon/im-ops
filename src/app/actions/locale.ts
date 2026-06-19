"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";

/**
 * Persist the operator's chosen UI language. Reads on every request via
 * src/i18n/request.ts. We revalidate the whole tree so server-rendered text
 * picks up the new locale immediately.
 */
export async function setLocale(next: Locale): Promise<void> {
	if (!isLocale(next)) return;
	const store = await cookies();
	store.set(LOCALE_COOKIE, next, {
		path: "/",
		maxAge: 60 * 60 * 24 * 365, // 1y
		sameSite: "lax",
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
	});
	revalidatePath("/", "layout");
}
