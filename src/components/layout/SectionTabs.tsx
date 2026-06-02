"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useNavFeedback } from "@/lib/useNavFeedback";
import { cn } from "@/lib/utils";

type Tab = { href: string; key: string; match: (p: string) => boolean };

/**
 * Secondary tab bar for the consolidated areas (Pipeline / Money / Directory).
 * Mounted once in the shell — renders the relevant tabs based on the current
 * path, nothing otherwise. Sub-screens live under one sidebar entry per area.
 */
const AREAS: { test: (p: string) => boolean; tabs: Tab[] }[] = [
	{
		test: (p) => p.startsWith("/pipeline") || p.startsWith("/leads") || p.startsWith("/proposals"),
		tabs: [
			{ href: "/pipeline", key: "board", match: (p) => p.startsWith("/pipeline") },
			{ href: "/leads", key: "leads", match: (p) => p.startsWith("/leads") },
			{
				href: "/proposals",
				key: "proposals",
				match: (p) => p.startsWith("/proposals"),
			},
		],
	},
	{
		test: (p) => p.startsWith("/money") || p.startsWith("/invoices") || p.startsWith("/reports"),
		tabs: [
			{ href: "/money", key: "overview", match: (p) => p.startsWith("/money") },
			{
				href: "/invoices",
				key: "invoices",
				match: (p) => p.startsWith("/invoices"),
			},
			{ href: "/reports", key: "reports", match: (p) => p.startsWith("/reports") },
		],
	},
	{
		test: (p) => p.startsWith("/customers") || p.startsWith("/fleet") || p.startsWith("/crew"),
		tabs: [
			{
				href: "/customers",
				key: "customers",
				match: (p) => p.startsWith("/customers"),
			},
			{ href: "/fleet", key: "fleet", match: (p) => p.startsWith("/fleet") },
			{ href: "/crew", key: "crew", match: (p) => p.startsWith("/crew") },
		],
	},
];

export function SectionTabs() {
	const pathname = usePathname();
	const t = useTranslations("nav");
	const { clicked, onNavClick } = useNavFeedback();
	const area = AREAS.find((a) => a.test(pathname));
	if (!area) return null;

	return (
		<div
			className="flex items-center gap-1 mb-5 border-b border-line overflow-x-auto scrollbar-thin"
			role="tablist"
		>
			{area.tabs.map((tab) => {
				const matched = tab.match(pathname);
				const active = matched || clicked === tab.href;
				const loading = clicked === tab.href && !matched;
				return (
					<Link
						key={tab.href}
						href={tab.href}
						role="tab"
						aria-selected={active}
						onClick={(e) => onNavClick(tab.href, e)}
						className={cn(
							"relative shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold transition-colors -mb-px border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-t",
							active
								? "text-primary-text border-primary"
								: "text-ink-muted border-transparent hover:text-ink",
						)}
					>
						{loading && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
						{t(tab.key)}
					</Link>
				);
			})}
		</div>
	);
}
