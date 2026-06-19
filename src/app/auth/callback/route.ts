import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback handler — exchanges the code for a session
 * and redirects to the dashboard.
 */
export async function GET(request: Request) {
	const { searchParams, origin } = new URL(request.url);
	const code = searchParams.get("code");

	// Resolve `next` safely: only same-origin relative paths are allowed, so a
	// crafted `next` (e.g. "//evil.com", "@evil.com", ".evil.com") can't turn
	// this into an open redirect off our domain.
	let destination = `${origin}/today`;
	const next = searchParams.get("next");
	if (next) {
		try {
			const target = new URL(next, origin);
			const allowed = [
				"/today",
				"/pipeline",
				"/leads",
				"/jobs",
				"/invoices",
				"/proposals",
				"/fleet",
				"/crew",
				"/customers",
				"/calendar",
				"/money",
				"/reports",
				"/settings",
				"/surveys",
			];
			const isAllowed = allowed.some(
				(p) => target.pathname === p || target.pathname.startsWith(`${p}/`),
			);
			if (target.origin === origin && isAllowed) destination = target.toString();
		} catch {
			// Malformed `next` — fall back to the default destination.
		}
	}

	if (code) {
		const supabase = await createClient();
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			return NextResponse.redirect(destination);
		}
	}

	// Auth failed — redirect back to login (no error detail in URL to avoid leaking to history/logs)
	return NextResponse.redirect(`${origin}/login`);
}
