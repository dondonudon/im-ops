import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/types";

/**
 * Supabase auth middleware — refreshes session on every request.
 * Redirects unauthenticated users to /login for protected routes.
 */
export async function middleware(request: NextRequest) {
	let supabaseResponse = NextResponse.next({ request });

	const supabase = createServerClient<Database>(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet) {
					for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
					supabaseResponse = NextResponse.next({ request });
					for (const { name, value, options } of cookiesToSet)
						supabaseResponse.cookies.set(name, value, options);
				},
			},
		},
	);

	// Refresh session — do not remove this line
	const {
		data: { user },
	} = await supabase.auth.getUser();

	// Apply security headers to every response, including public routes
	supabaseResponse.headers.set("X-Frame-Options", "DENY");
	supabaseResponse.headers.set("X-Content-Type-Options", "nosniff");
	supabaseResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	supabaseResponse.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
	// SHA-256 hashes of the static theme-init inline script in src/app/layout.tsx.
	// Two hashes are listed because Next.js serialises the script content with
	// slightly different whitespace depending on rendering context (full SSR vs
	// partial). Both must be present so either variant passes CSP.
	// Recompute if the script ever changes:
	//   echo -n '<script-content>' | openssl dgst -sha256 -binary | base64
	const THEME_SCRIPT_HASHES =
		"'sha256-ZbmMjbq7u/pJLliTg9iuotQD9CrMXrlGujhpCcwGPso=' 'sha256-Q+8tPsjVtiDsjF/Cv8FMOpg2Yg91oKFKDAJat1PPb2g='";
	// 'unsafe-eval' is required by Next.js React Fast Refresh in development only.
	const scriptSrc =
		process.env.NODE_ENV === "production"
			? `script-src 'self' ${THEME_SCRIPT_HASHES}`
			: "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
	supabaseResponse.headers.set(
		"Content-Security-Policy",
		[
			"default-src 'self'",
			scriptSrc,
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' *.supabase.co data: blob:",
			"connect-src 'self' *.supabase.co",
			"font-src 'self'",
			"frame-src 'none'",
			"object-src 'none'",
			"base-uri 'self'",
		].join("; "),
	);
	if (process.env.NODE_ENV === "production") {
		supabaseResponse.headers.set(
			"Strict-Transport-Security",
			"max-age=31536000; includeSubDomains",
		);
	}

	const { pathname } = request.nextUrl;

	// Allow public routes
	if (
		pathname === "/" ||
		pathname.startsWith("/login") ||
		pathname.startsWith("/auth") ||
		pathname.startsWith("/privacy") ||
		pathname.startsWith("/terms")
	) {
		return supabaseResponse;
	}

	// Redirect unauthenticated users to login
	if (!user) {
		const url = request.nextUrl.clone();
		url.pathname = "/login";
		return NextResponse.redirect(url);
	}

	return supabaseResponse;
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icons).*)"],
};
