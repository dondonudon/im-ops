"use client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
	Briefcase,
	CalendarDays,
	Kanban,
	LayoutDashboard,
	Loader2,
	LogOut,
	Settings,
	Truck,
	Users,
	Wallet,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useNavFeedback } from "@/lib/useNavFeedback";

type NavKey =
	| "today"
	| "pipeline"
	| "jobs"
	| "calendar"
	| "money"
	| "directory"
	| "settings";

type NavItem = {
	href: string;
	key: NavKey;
	icon: typeof LayoutDashboard;
	/** Which pathnames mark this item active (it owns a whole area). */
	match: (pathname: string) => boolean;
};

/**
 * Flattened, workflow-based navigation (see imops_redesign_plan_1.md §2.2).
 * Pipeline / Money / Directory each own an area; their sub-screens are reached
 * via the SectionTabs bar, not separate sidebar entries.
 */
const NAV_ITEMS: NavItem[] = [
	{
		href: "/today",
		key: "today",
		icon: LayoutDashboard,
		match: (p) => p === "/today",
	},
	{
		href: "/pipeline",
		key: "pipeline",
		icon: Kanban,
		match: (p) =>
			p.startsWith("/pipeline") ||
			p.startsWith("/leads") ||
			p.startsWith("/proposals") ||
			p.startsWith("/estimations") ||
			p.startsWith("/surveys"),
	},
	{
		href: "/jobs",
		key: "jobs",
		icon: Briefcase,
		match: (p) => p.startsWith("/jobs"),
	},
	{
		href: "/calendar",
		key: "calendar",
		icon: CalendarDays,
		match: (p) => p.startsWith("/calendar"),
	},
	{
		href: "/money",
		key: "money",
		icon: Wallet,
		match: (p) =>
			p.startsWith("/money") ||
			p.startsWith("/invoices") ||
			p.startsWith("/reports"),
	},
	{
		href: "/customers",
		key: "directory",
		icon: Users,
		match: (p) =>
			p.startsWith("/customers") ||
			p.startsWith("/fleet") ||
			p.startsWith("/crew"),
	},
];

/**
 * Sidebar navigation — light token chrome, cobalt active state, collapsible on
 * desktop. On mobile: fixed drawer that slides in from the left.
 */
export function Sidebar({
	collapsed,
	mobileOpen,
	onMobileClose,
}: {
	collapsed: boolean;
	onToggle: () => void;
	mobileOpen: boolean;
	onMobileClose: () => void;
}) {
	const pathname = usePathname();
	const router = useRouter();
	const t = useTranslations("nav");
	const tTopbar = useTranslations("topbar");
	const { clicked, onNavClick } = useNavFeedback();

	async function handleLogout() {
		const supabase = createClient();
		await supabase.auth.signOut();
		router.push("/login");
	}

	function NavLink({ item }: { item: NavItem }) {
		const { href, key, icon: Icon } = item;
		const label = t(key);
		const matched = item.match(pathname);
		const isActive = matched || clicked === href;
		const isLoading = clicked === href && !matched;
		return (
			<Link
				href={href}
				title={collapsed ? label : undefined}
				onClick={(e) => {
					onMobileClose();
					onNavClick(href, e);
				}}
				className={cn(
					"flex items-center rounded-lg text-sm font-medium transition-all duration-150",
					collapsed
						? "md:justify-center md:w-10 md:h-10 md:mx-auto gap-3 px-3 py-2"
						: "gap-3 px-3 py-2",
					isActive
						? "bg-primary text-primary-fg shadow-token-sm"
						: "text-ink-muted hover:bg-subtle hover:text-ink",
				)}
				aria-current={isActive ? "page" : undefined}
			>
				{isLoading ? (
					<Loader2 size={18} aria-hidden="true" className="shrink-0 animate-spin" />
				) : (
					<Icon size={18} aria-hidden="true" className="shrink-0" />
				)}
				<span className={cn(collapsed && "md:hidden")}>{label}</span>
			</Link>
		);
	}

	const settingsItem: NavItem = {
		href: "/settings",
		key: "settings",
		icon: Settings,
		match: (p) => p.startsWith("/settings"),
	};

	return (
		<aside
			className={cn(
				"fixed inset-y-0 left-0 z-50 flex flex-col bg-[var(--sidebar)] text-ink border-r border-line transition-transform duration-300 ease-in-out",
				"md:relative md:translate-x-0 md:z-auto",
				mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
				collapsed ? "md:w-16 w-[232px]" : "w-[232px]",
			)}
			aria-label="Main navigation"
		>
			{/* Brand */}
			<div
				className={cn(
					"flex items-center gap-3 px-4 py-5 border-b border-line shrink-0",
					collapsed && "md:justify-center md:px-0",
				)}
			>
				<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0 shadow-lg shadow-brand-900/40">
					<Truck size={15} className="text-white" aria-hidden="true" />
				</div>
				<div className={cn("overflow-hidden flex-1", collapsed && "md:hidden")}>
					<p className="text-[13px] font-bold text-ink leading-tight whitespace-nowrap">
						Indo Mover
					</p>
					<p className="text-[10px] text-ink-faint whitespace-nowrap">
						Operations Platform
					</p>
				</div>
				{/* Close button — mobile only */}
				<button
					type="button"
					onClick={onMobileClose}
					aria-label={tTopbar("openMenu")}
					className="md:hidden ml-auto p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
				>
					<X size={18} aria-hidden="true" />
				</button>
			</div>

			{/* Navigation */}
			<nav
				className={cn("flex-1 overflow-y-auto py-3 scrollbar-thin space-y-0.5", collapsed ? "px-2" : "px-3")}
				aria-label="Primary"
			>
				{NAV_ITEMS.map((item) => (
					<NavLink key={item.href} item={item} />
				))}

				<div
					className={cn("my-3 border-t border-line", collapsed ? "mx-0" : "mx-0")}
				/>

				<NavLink item={settingsItem} />
			</nav>

			{/* Bottom: sign out */}
			<div
				className={cn(
					"border-t border-line py-3 space-y-1",
					collapsed ? "px-2" : "px-3",
				)}
			>
				<button
					type="button"
					onClick={handleLogout}
					title={collapsed ? t("signOut") : undefined}
					className={cn(
						"flex items-center rounded-lg text-sm font-medium text-ink-muted hover:bg-subtle hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] w-full",
						collapsed
							? "md:justify-center md:w-10 md:h-10 md:mx-auto gap-2.5 px-3 py-2"
							: "gap-2.5 px-3 py-2",
					)}
				>
					<LogOut size={16} aria-hidden="true" />
					<span className={cn(collapsed && "md:hidden")}>{t("signOut")}</span>
				</button>
			</div>
		</aside>
	);
}
