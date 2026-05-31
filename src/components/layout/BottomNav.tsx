"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
	LayoutDashboard,
	Briefcase,
	Wallet,
	Menu as MenuIcon,
	Plus,
	Search,
	UserPlus,
	FilePlus2,
	Loader2,
	X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavFeedback } from "@/lib/useNavFeedback";

type Item = {
	href: string;
	key: string;
	icon: typeof LayoutDashboard;
	match: (p: string) => boolean;
};

const LEFT: Item[] = [
	{ href: "/today", key: "today", icon: LayoutDashboard, match: (p) => p === "/today" },
	{ href: "/jobs", key: "jobs", icon: Briefcase, match: (p) => p.startsWith("/jobs") },
];
const RIGHT: Item[] = [
	{
		href: "/money",
		key: "money",
		icon: Wallet,
		match: (p) =>
			p.startsWith("/money") ||
			p.startsWith("/invoices") ||
			p.startsWith("/reports"),
	},
];

/**
 * Mobile field-mode primary navigation: a thumb-reachable bottom bar
 * (Today · Jobs · ＋ · Money · Menu). Hidden on desktop (md+), where the
 * sidebar is the primary nav. The ＋ opens a quick-add sheet.
 */
export function BottomNav({ onMenu }: { onMenu: () => void }) {
	const pathname = usePathname();
	const router = useRouter();
	const t = useTranslations("nav");
	const tField = useTranslations("field");
	const { clicked, onNavClick } = useNavFeedback();
	const [sheetOpen, setSheetOpen] = useState(false);

	function go(href: string) {
		setSheetOpen(false);
		router.push(href);
	}

	function Tab({ item }: { item: Item }) {
		const matched = item.match(pathname);
		const active = matched || clicked === item.href;
		const loading = clicked === item.href && !matched;
		const Icon = item.icon;
		return (
			<Link
				href={item.href}
				aria-current={active ? "page" : undefined}
				onClick={(e) => onNavClick(item.href, e)}
				className={cn(
					"flex flex-col items-center justify-center gap-0.5 h-full text-[10px] font-medium transition-colors",
					active ? "text-primary-text" : "text-ink-faint",
				)}
			>
				{loading ? (
					<Loader2 size={20} aria-hidden="true" className="animate-spin" />
				) : (
					<Icon size={20} aria-hidden="true" />
				)}
				{t(item.key)}
			</Link>
		);
	}

	return (
		<>
			<nav
				aria-label="Mobile navigation"
				className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-surface border-t border-line grid grid-cols-5 items-center"
				style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
			>
				{LEFT.map((item) => (
					<Tab key={item.href} item={item} />
				))}

				{/* Center quick-add */}
				<div className="flex items-center justify-center">
					<button
						type="button"
						onClick={() => setSheetOpen(true)}
						aria-label={tField("quickAdd")}
						aria-haspopup="dialog"
						className="-mt-6 w-14 h-14 rounded-full bg-primary text-primary-fg shadow-token-md flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
					>
						<Plus size={24} aria-hidden="true" />
					</button>
				</div>

				{RIGHT.map((item) => (
					<Tab key={item.href} item={item} />
				))}

				{/* Menu — opens the full sidebar drawer */}
				<button
					type="button"
					onClick={onMenu}
					className="flex flex-col items-center justify-center gap-0.5 h-full text-[10px] font-medium text-ink-faint"
				>
					<MenuIcon size={20} aria-hidden="true" />
					{tField("menu")}
				</button>
			</nav>

			{/* Quick-add sheet */}
			{sheetOpen && (
				<div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
					<button
						type="button"
						aria-label="Close"
						onClick={() => setSheetOpen(false)}
						className="absolute inset-0 bg-black/50 backdrop-blur-sm"
					/>
					<div className="absolute bottom-0 inset-x-0 bg-surface rounded-t-2xl border-t border-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-fade-in-up">
						<div className="flex items-center justify-between mb-3">
							<h2 className="text-sm font-semibold text-ink">
								{tField("quickAdd")}
							</h2>
							<button
								type="button"
								onClick={() => setSheetOpen(false)}
								aria-label="Close"
								className="p-1.5 rounded-lg text-ink-faint hover:bg-subtle hover:text-ink"
							>
								<X size={18} aria-hidden="true" />
							</button>
						</div>
						<div className="grid grid-cols-3 gap-2">
							<SheetAction
								icon={<FilePlus2 size={20} />}
								label={tField("newLead")}
								onClick={() => {
									setSheetOpen(false);
									window.dispatchEvent(new Event("imops:new-lead"));
								}}
							/>
							<SheetAction
								icon={<UserPlus size={20} />}
								label={tField("newCustomer")}
								onClick={() => go("/customers/new")}
							/>
							<SheetAction
								icon={<Search size={20} />}
								label={tField("search")}
								onClick={() => {
									setSheetOpen(false);
									window.dispatchEvent(new Event("imops:open-search"));
								}}
							/>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

function SheetAction({
	icon,
	label,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-subtle py-4 text-xs font-medium text-ink active:bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
		>
			<span className="text-primary">{icon}</span>
			{label}
		</button>
	);
}
