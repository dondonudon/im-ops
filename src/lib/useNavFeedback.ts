"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Optimistic navigation feedback. Tracks the href the user just clicked so a
 * nav item can light up + show a spinner *immediately*, instead of waiting for
 * the server round-trip to settle the URL. Clears once the route commits.
 *
 * Preserves native <Link> behavior — only plain left-clicks register
 * (modifier/middle clicks fall through to the browser for new-tab, etc.).
 */
export function useNavFeedback() {
	const pathname = usePathname();
	const [clicked, setClicked] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger; setClicked is a stable React setter
	useEffect(() => {
		setClicked(null);
	}, [pathname]);

	// Safety: never leave a phantom spinner if a navigation is cancelled.
	useEffect(() => {
		if (!clicked) return;
		const id = setTimeout(() => setClicked(null), 8000);
		return () => clearTimeout(id);
	}, [clicked]);

	function onNavClick(href: string, e: React.MouseEvent) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
			return;
		}
		if (href === pathname) return;
		setClicked(href);
	}

	return { clicked, onNavClick };
}
