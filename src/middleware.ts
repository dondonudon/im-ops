import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/types";

/**
 * Supabase auth middleware — refreshes session on every request.
 * Redirects unauthenticated users to /login for protected routes.
 */
export async function middleware(request: NextRequest) {
	// Generate a fresh cryptographic nonce for every request.
	// This is forwarded to Next.js via x-nonce so it adds the nonce to ALL its
	// generated inline scripts automatically (Next.js 14 App Router feature).
	// With 'strict-dynamic', scripts loaded by a nonce-bearing script are also
	// trusted, which covers every dynamically-imported chunk.
	const nonce = btoa(crypto.randomUUID());

	// Helper: build request headers that include the nonce + current cookie state.
	// Must be re-called inside setAll() after request.cookies.set() to capture
	// the updated Cookie header before NextResponse.next() is created.
	// x-nonce is only forwarded in production: in development the CSP uses
	// 'unsafe-inline' (no nonce), so stamping x-nonce causes a hydration mismatch
	// between the initial page-load nonce and the new nonce on each HMR re-render.
	const buildRequestHeaders = () => {
		const hdrs = new Headers(request.headers);
		if (process.env.NODE_ENV === "production") hdrs.set("x-nonce", nonce);
		return hdrs;
	};

	let supabaseResponse = NextResponse.next({ request: { headers: buildRequestHeaders() } });

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
					supabaseResponse = NextResponse.next({ request: { headers: buildRequestHeaders() } });
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
	// Nonce-based CSP: 'strict-dynamic' propagates trust from the nonce-bearing
	// bootstrapper scripts to every chunk Next.js loads dynamically, so no per-
	// chunk hash is needed. Development keeps 'unsafe-inline' + 'unsafe-eval' for
	// React Fast Refresh.
	// 'wasm-unsafe-eval' is required for @react-pdf/renderer which uses WebAssembly
	// for font rendering. In production the nonce-based 'strict-dynamic' policy
	// doesn't implicitly allow WASM, so we must add the permission explicitly.
	const scriptSrc =
		process.env.NODE_ENV === "production"
			? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`
			: "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'";
	supabaseResponse.headers.set(
		"Content-Security-Policy",
		[
			"default-src 'self'",
			scriptSrc,
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' *.supabase.co data: blob:",
			// data: is required for @react-pdf/renderer which loads its WASM binary
			// as a data: URL via fetch() before passing it to WebAssembly.instantiate()
			"connect-src 'self' *.supabase.co data: blob:",
			// blob: workers are required by @react-pdf/renderer which spawns Web Workers
			// via blob: URLs for font rendering; worker-src falls back to script-src
			// if omitted, and script-src intentionally does not include blob:
			"worker-src blob:",
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
