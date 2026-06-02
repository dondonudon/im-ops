"use client";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * Top-of-viewport indeterminate progress bar that fires whenever an internal
 * navigation is pending. Catches:
 *  - `<Link>` clicks (via a global click listener)
 *  - `router.push` calls that complete in a new pathname/search
 *
 * The bar is purely informational — it never gates user input. Cursor is set
 * to `wait` on the document body while pending so even non-bar areas hint at
 * progress.
 *
 * `useSearchParams` requires Suspense per Next 14 — the inner component is
 * wrapped below.
 */
function Inner() {
	const [active, setActive] = useState(false);
	const firstRender = useRef(true);

	// Whenever the URL settles, the navigation is over.
	useEffect(() => {
		if (firstRender.current) {
			firstRender.current = false;
			return;
		}
		setActive(false);
		document.body.style.cursor = "";
	}, []);

	// Capture link clicks to start the bar.
	useEffect(() => {
		function start() {
			setActive(true);
			document.body.style.cursor = "wait";
		}

		function onClick(e: MouseEvent) {
			// Skip modifier/middle/right clicks — those don't navigate the current tab.
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || e.defaultPrevented)
				return;

			const anchor = (e.target as HTMLElement | null)?.closest("a");
			if (!anchor) return;
			if (anchor.getAttribute("target") === "_blank") return;
			if (anchor.hasAttribute("download")) return;

			const href = anchor.getAttribute("href");
			if (!href) return;
			if (
				href.startsWith("http://") ||
				href.startsWith("https://") ||
				href.startsWith("//") ||
				href.startsWith("mailto:") ||
				href.startsWith("tel:") ||
				href.startsWith("#")
			) {
				return;
			}

			// Same URL → no navigation will happen.
			try {
				const target = new URL(anchor.href, window.location.href);
				if (
					target.pathname === window.location.pathname &&
					target.search === window.location.search
				) {
					return;
				}
				// Different origin → browser handles it natively, no React route change.
				if (target.origin !== window.location.origin) return;
			} catch {
				// If URL parsing fails, just start the bar — safer to over-show.
			}

			start();
		}

		document.addEventListener("click", onClick);
		return () => document.removeEventListener("click", onClick);
	}, []);

	// Programmatic navigation hook: components can dispatch this to trigger the bar.
	useEffect(() => {
		function onStart() {
			setActive(true);
			document.body.style.cursor = "wait";
		}
		window.addEventListener("imops:nav-start", onStart);
		return () => window.removeEventListener("imops:nav-start", onStart);
	}, []);

	if (!active) return null;
	return (
		<div
			aria-hidden="true"
			className="fixed top-0 left-0 right-0 z-[100] h-[3px] overflow-hidden pointer-events-none"
		>
			<div
				className="h-full w-full bg-primary origin-left animate-progress-indeterminate"
				style={{ boxShadow: "0 0 8px 1px var(--primary)" }}
			/>
		</div>
	);
}

export function NavigationProgress() {
	return (
		<Suspense fallback={null}>
			<Inner />
		</Suspense>
	);
}
