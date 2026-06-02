"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonStyles } from "./Button";

/**
 * Server-paginated list navigation. The page passes `page` (1-based),
 * `pageSize` and the total `count`; this builds Prev/Next links that preserve
 * all other query params (search, status, view). Renders nothing when
 * everything fits on one page.
 */
export function Pagination({
	page,
	pageSize,
	total,
}: {
	page: number;
	pageSize: number;
	total: number;
}) {
	const t = useTranslations("pagination");
	const pathname = usePathname();
	const sp = useSearchParams();

	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	if (total <= pageSize) return null;

	const from = (page - 1) * pageSize + 1;
	const to = Math.min(page * pageSize, total);

	function href(p: number) {
		const params = new URLSearchParams(sp.toString());
		params.set("page", String(p));
		return `${pathname}?${params.toString()}`;
	}

	const prevDisabled = page <= 1;
	const nextDisabled = page >= pageCount;
	const linkCls = buttonStyles({ variant: "secondary", size: "sm" });
	const disabledCls = buttonStyles({
		variant: "secondary",
		size: "sm",
		className: "opacity-50 pointer-events-none",
	});

	return (
		<nav className="flex items-center justify-between gap-3 pt-1" aria-label="Pagination">
			<p className="text-xs text-ink-muted tabular-nums">{t("showing", { from, to, total })}</p>
			<div className="flex items-center gap-2">
				{prevDisabled ? (
					<span className={disabledCls} aria-disabled="true">
						<ChevronLeft size={14} aria-hidden="true" />
						{t("prev")}
					</span>
				) : (
					<Link href={href(page - 1)} className={linkCls} rel="prev">
						<ChevronLeft size={14} aria-hidden="true" />
						{t("prev")}
					</Link>
				)}
				{nextDisabled ? (
					<span className={disabledCls} aria-disabled="true">
						{t("next")}
						<ChevronRight size={14} aria-hidden="true" />
					</span>
				) : (
					<Link href={href(page + 1)} className={linkCls} rel="next">
						{t("next")}
						<ChevronRight size={14} aria-hidden="true" />
					</Link>
				)}
			</div>
		</nav>
	);
}
