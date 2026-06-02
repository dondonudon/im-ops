"use client";
import {
	Briefcase,
	CalendarDays,
	FilePlus2,
	FileText,
	Kanban,
	LayoutDashboard,
	Loader2,
	Receipt,
	Search,
	Settings,
	Truck,
	UserCheck,
	UserPlus,
	Users,
	Wallet,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sanitizeSearch } from "@/lib/utils";

// ── Actions ────────────────────────────────────────────────────────────────

type Action = {
	id: string;
	title: string;
	subtitle: string;
	icon: typeof Briefcase;
	keywords: string;
	perform: () => void;
};

// ── Types ────────────────────────────────────────────────────────────────

type Group = "leads" | "jobs" | "proposals" | "customers" | "fleet" | "crew" | "invoices";

type Hit = {
	id: string; // entity uuid
	group: Group;
	title: string;
	subtitle?: string;
	url: string;
};

const GROUP_META: Record<Group, { icon: typeof Briefcase; order: number }> = {
	leads: { icon: Search, order: 1 },
	jobs: { icon: Briefcase, order: 2 },
	proposals: { icon: FileText, order: 3 },
	customers: { icon: Users, order: 4 },
	invoices: { icon: Receipt, order: 5 },
	fleet: { icon: Truck, order: 6 },
	crew: { icon: UserCheck, order: 7 },
};

const PER_GROUP_LIMIT = 5;

// ── Memoised list-item components ───────────────────────────────────────

type ActionButtonProps = { action: Action; active: boolean; idx: number };
const ActionButton = memo(function ActionButton({ action, active, idx }: ActionButtonProps) {
	const Icon = action.icon;
	return (
		<li role="presentation">
			<button
				type="button"
				role="option"
				aria-selected={active}
				data-hit-idx={idx}
				onClick={action.perform}
				className={`w-full text-left flex items-center gap-3 px-3 py-2 transition-colors ${
					active ? "bg-primary-subtle" : "hover:bg-subtle"
				}`}
			>
				<Icon
					size={14}
					className={active ? "text-primary-text shrink-0" : "text-ink-faint shrink-0"}
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-ink truncate">{action.title}</p>
					<p className="text-xs text-ink-muted truncate">{action.subtitle}</p>
				</div>
			</button>
		</li>
	);
});

type HitButtonProps = {
	hit: Hit;
	active: boolean;
	idx: number;
	Icon: typeof Briefcase;
	onSelect: (hit: Hit) => void;
};
const HitButton = memo(function HitButton({ hit, active, idx, Icon, onSelect }: HitButtonProps) {
	return (
		<li role="presentation">
			<button
				type="button"
				role="option"
				aria-selected={active}
				data-hit-idx={idx}
				onClick={() => onSelect(hit)}
				className={`w-full text-left flex items-center gap-3 px-3 py-2 transition-colors ${
					active ? "bg-primary-subtle" : "hover:bg-subtle"
				}`}
			>
				<Icon
					size={14}
					className={active ? "text-primary-text shrink-0" : "text-ink-faint shrink-0"}
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-ink truncate">{hit.title}</p>
					{hit.subtitle && <p className="text-xs text-ink-muted truncate">{hit.subtitle}</p>}
				</div>
			</button>
		</li>
	);
});

// ── Main component ───────────────────────────────────────────────────────

/**
 * Global command palette. Mounted once at the dashboard root.
 *
 * Trigger: ⌘K / Ctrl+K from anywhere, or the custom event "imops:open-search"
 * (dispatched by the TopBar's search button).
 *
 * Queries run client-side via the Supabase client so they respect RLS, and
 * fire in parallel with per-group limits to keep latency low (<300ms typical).
 */
export function CommandPalette() {
	const router = useRouter();
	const t = useTranslations("search");
	const tField = useTranslations("field");
	const tNav = useTranslations("nav");
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<Hit[]>([]);
	const [loading, setLoading] = useState(false);
	const [activeIdx, setActiveIdx] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	// ── Open / close ────────────────────────────────────────────────────

	const openPalette = useCallback(() => {
		setOpen(true);
		setActiveIdx(0);
	}, []);

	const closePalette = useCallback(() => {
		setOpen(false);
		setQuery("");
		setHits([]);
		setActiveIdx(0);
	}, []);

	// ── Actions (create / navigate) ─────────────────────────────────────
	const actions = useMemo<Action[]>(() => {
		const go = (url: string) => () => {
			closePalette();
			router.push(url);
		};
		const create = t("create");
		const openPage = t("openPage");
		return [
			{
				id: "new-lead",
				title: tField("newLead"),
				subtitle: create,
				icon: FilePlus2,
				keywords: "new lead create prospek baru tambah",
				perform: () => {
					closePalette();
					window.dispatchEvent(new Event("imops:new-lead"));
				},
			},
			{
				id: "new-customer",
				title: tField("newCustomer"),
				subtitle: create,
				icon: UserPlus,
				keywords: "new customer create pelanggan baru tambah",
				perform: go("/customers/new"),
			},
			{
				id: "new-fleet",
				title: tField("newFleet"),
				subtitle: create,
				icon: Truck,
				keywords: "new fleet create baru tambah",
				perform: go("/fleet/new"),
			},
			{
				id: "new-crew",
				title: tField("newCrew"),
				subtitle: create,
				icon: UserCheck,
				keywords: "new crew create kru baru tambah",
				perform: go("/crew/new"),
			},
			{
				id: "go-today",
				title: tNav("today"),
				subtitle: openPage,
				icon: LayoutDashboard,
				keywords: "today home hari ini dashboard",
				perform: go("/today"),
			},
			{
				id: "go-pipeline",
				title: tNav("pipeline"),
				subtitle: openPage,
				icon: Kanban,
				keywords: "pipeline deals funnel board leads proposals",
				perform: go("/pipeline"),
			},
			{
				id: "go-jobs",
				title: tNav("jobs"),
				subtitle: openPage,
				icon: Briefcase,
				keywords: "jobs pekerjaan moves",
				perform: go("/jobs"),
			},
			{
				id: "go-calendar",
				title: tNav("calendar"),
				subtitle: openPage,
				icon: CalendarDays,
				keywords: "calendar kalender schedule",
				perform: go("/calendar"),
			},
			{
				id: "go-money",
				title: tNav("money"),
				subtitle: openPage,
				icon: Wallet,
				keywords: "money invoices reports keuangan cash ar",
				perform: go("/money"),
			},
			{
				id: "go-settings",
				title: tNav("settings"),
				subtitle: openPage,
				icon: Settings,
				keywords: "settings pengaturan config",
				perform: go("/settings"),
			},
		];
	}, [router, closePalette, t, tField, tNav]);

	const filteredActions = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return actions;
		return actions.filter((a) => a.title.toLowerCase().includes(q) || a.keywords.includes(q));
	}, [actions, query]);

	// ⌘K / Ctrl+K global shortcut + external trigger event
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setOpen((prev) => {
					if (prev) {
						setQuery("");
						setHits([]);
						setActiveIdx(0);
						return false;
					}
					setActiveIdx(0);
					return true;
				});
			}
		}
		function onExternalTrigger() {
			openPalette();
		}
		window.addEventListener("keydown", onKey);
		window.addEventListener("imops:open-search", onExternalTrigger);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("imops:open-search", onExternalTrigger);
		};
	}, [openPalette]);

	// Focus the input every time the palette opens
	useEffect(() => {
		if (open) {
			// next tick so the element exists
			queueMicrotask(() => inputRef.current?.focus());
		}
	}, [open]);

	// Lock body scroll while open
	useEffect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = prev;
		};
	}, [open]);

	// ── Debounced search ────────────────────────────────────────────────

	useEffect(() => {
		const trimmed = query.trim();
		if (!trimmed) {
			setHits([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		const ac = new AbortController();
		const handle = setTimeout(() => {
			void runSearch(trimmed, ac.signal).then((newHits) => {
				setHits(newHits);
				setActiveIdx(0);
				setLoading(false);
			});
		}, 180);
		return () => {
			clearTimeout(handle);
			ac.abort();
		};
	}, [query]);

	// ── Grouped view ────────────────────────────────────────────────────

	const grouped = useMemo(() => {
		const map = new Map<Group, Hit[]>();
		for (const h of hits) {
			const arr = map.get(h.group);
			if (arr) arr.push(h);
			else map.set(h.group, [h]);
		}
		// Stable, deterministic ordering per GROUP_META.order
		return Array.from(map.entries()).sort(([a], [b]) => GROUP_META[a].order - GROUP_META[b].order);
	}, [hits]);

	const flatHits = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

	// O(1) index lookup — avoids O(n²) indexOf inside the render loop.
	const flatHitsIndexMap = useMemo(() => {
		const m = new Map<Hit, number>();
		for (let i = 0; i < flatHits.length; i++) m.set(flatHits[i], i);
		return m;
	}, [flatHits]);

	// Combined navigable length: actions first, then search hits.
	const actionCount = filteredActions.length;
	const total = actionCount + flatHits.length;

	// Keep activeIdx within bounds
	useEffect(() => {
		if (activeIdx >= total) setActiveIdx(0);
	}, [activeIdx, total]);

	// Scroll active row into view
	useEffect(() => {
		if (!listRef.current) return;
		const node = listRef.current.querySelector<HTMLElement>(`[data-hit-idx="${activeIdx}"]`);
		node?.scrollIntoView({ block: "nearest" });
	}, [activeIdx]);

	// ── Keyboard inside the modal ───────────────────────────────────────

	function handleInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Escape") {
			e.preventDefault();
			closePalette();
			return;
		}
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIdx((i) => Math.min(i + 1, Math.max(0, total - 1)));
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIdx((i) => Math.max(i - 1, 0));
			return;
		}
		if (e.key === "Enter") {
			e.preventDefault();
			runActive();
		}
	}

	/** Run whatever is highlighted — an action, or navigate to a search hit. */
	function runActive() {
		if (activeIdx < actionCount) {
			filteredActions[activeIdx]?.perform();
			return;
		}
		const hit = flatHits[activeIdx - actionCount];
		if (hit) navigateTo(hit);
	}

	const navigateTo = useCallback(
		(hit: Hit) => {
			closePalette();
			router.push(hit.url);
		},
		[closePalette, router],
	);

	// ── Render ──────────────────────────────────────────────────────────

	if (!open) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Search"
			className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-sm"
			onClick={closePalette}
			onKeyDown={(e) => e.key === "Escape" && closePalette()}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation-only handler; no semantic interaction */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation-only handler; no semantic interaction */}
			<div
				className="w-full max-w-2xl bg-surface rounded-2xl shadow-token ring-1 ring-black/5 overflow-hidden flex flex-col max-h-[70vh]"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Input row */}
				<div className="flex items-center gap-3 px-4 py-3 border-b border-line">
					<Search size={18} className="text-ink-faint" aria-hidden="true" />
					<input
						ref={inputRef}
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleInputKey}
						placeholder={t("placeholder")}
						className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
						aria-label={t("placeholder")}
						autoComplete="off"
						spellCheck={false}
					/>
					{loading && (
						<Loader2 size={14} className="animate-spin text-ink-faint" aria-hidden="true" />
					)}
					<button
						type="button"
						onClick={closePalette}
						aria-label="Close search"
						className="w-7 h-7 flex items-center justify-center rounded-md text-ink-faint hover:bg-subtle hover:text-ink transition-colors"
					>
						<X size={14} aria-hidden="true" />
					</button>
				</div>

				{/* Results */}
				<div
					ref={listRef}
					className="flex-1 overflow-y-auto py-2"
					role="listbox"
					onMouseOver={(e) => {
						const el = (e.target as Element).closest("[data-hit-idx]");
						if (el) {
							const idx = Number(el.getAttribute("data-hit-idx"));
							if (!Number.isNaN(idx)) setActiveIdx(idx);
						}
					}}
					onFocus={(e) => {
						const el = (e.target as Element).closest("[data-hit-idx]");
						if (el) {
							const idx = Number(el.getAttribute("data-hit-idx"));
							if (!Number.isNaN(idx)) setActiveIdx(idx);
						}
					}}
				>
					{/* Actions */}
					{filteredActions.length > 0 && (
						<section className="py-1">
							<header className="px-3 py-1 text-[10px] font-semibold text-ink-faint uppercase tracking-widest">
								{t("actionsTitle")}
							</header>
							<ul>
								{filteredActions.map((action, i) => (
									<ActionButton key={action.id} action={action} active={i === activeIdx} idx={i} />
								))}
							</ul>
						</section>
					)}

					{query.trim() && grouped.length === 0 && filteredActions.length === 0 && !loading ? (
						<p className="text-center text-sm text-ink-faint py-8">{t("noResults", { query })}</p>
					) : (
						grouped.map(([group, items]) => {
							const Icon = GROUP_META[group].icon;
							return (
								<section key={group} className="py-1">
									<header className="px-3 py-1 text-[10px] font-semibold text-ink-faint uppercase tracking-widest">
										{t(`groups.${group}` as never)}
									</header>
									<ul>
										{items.map((hit) => {
											const idx = actionCount + (flatHitsIndexMap.get(hit) ?? 0);
											return (
												<HitButton
													key={hit.id}
													hit={hit}
													active={idx === activeIdx}
													idx={idx}
													Icon={Icon}
													onSelect={navigateTo}
												/>
											);
										})}
									</ul>
								</section>
							);
						})
					)}
				</div>

				{/* Footer hints */}
				<div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-line text-[10px] text-ink-faint">
					<div className="flex items-center gap-3">
						<KeyHint k="↑" /> <KeyHint k="↓" /> <span>{t("hintNavigate")}</span>
						<KeyHint k="↵" /> <span>{t("hintOpen")}</span>
						<KeyHint k="esc" /> <span>{t("hintClose")}</span>
					</div>
					<span className="hidden sm:inline">
						<KeyHint k="⌘" /> <KeyHint k="K" /> {t("hintToggle")}
					</span>
				</div>
			</div>
		</div>
	);
}

function KeyHint({ k }: { k: string }) {
	return (
		<kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded bg-subtle text-ink-muted font-mono">
			{k}
		</kbd>
	);
}

// ── Search executor ──────────────────────────────────────────────────────

async function runSearch(raw: string, signal: AbortSignal): Promise<Hit[]> {
	const clean = sanitizeSearch(raw);
	if (!clean) return [];
	const pattern = `%${clean}%`;
	const supabase = createClient();

	type LeadRow = {
		id: string;
		pickup_address: string | null;
		destination_address: string | null;
		customers: { name: string } | null;
	};
	type JobRow = {
		id: string;
		job_number: string;
		move_date: string | null;
		proposals: {
			leads: { customers: { name: string } | null } | null;
		} | null;
	};
	type ProposalRow = {
		id: string;
		proposal_number: string;
		status: string;
		leads: { customers: { name: string } | null } | null;
	};
	type CustomerRow = {
		id: string;
		name: string;
		phone: string | null;
		company_name: string | null;
	};
	type FleetRow = { id: string; name: string; phone: string | null };
	type CrewRow = { id: string; name: string; phone: string | null };
	type InvoiceRow = {
		id: string;
		invoice_number: string;
		jobs: {
			job_number: string;
			proposals: { leads: { customers: { name: string } | null } | null } | null;
		} | null;
	};

	const [
		customersRes,
		leadsByText,
		leadsByCustomer,
		jobsByNumber,
		jobsByCustomer,
		proposalsByNumber,
		proposalsByCustomer,
		fleetRes,
		crewRes,
		invoicesRes,
	] = await Promise.all([
		supabase
			.from("customers")
			.select("id, name, phone, company_name")
			.or(
				`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},company_name.ilike.${pattern}`,
			)
			.limit(PER_GROUP_LIMIT)
			.abortSignal(signal),

		supabase
			.from("leads")
			.select("id, pickup_address, destination_address, customers(name)")
			.or(
				`pickup_address.ilike.${pattern},destination_address.ilike.${pattern},notes.ilike.${pattern}`,
			)
			.limit(PER_GROUP_LIMIT)
			.abortSignal(signal),
		supabase
			.from("leads")
			.select("id, pickup_address, destination_address, customers!inner(name)")
			.ilike("customers.name", pattern)
			.limit(PER_GROUP_LIMIT)
			.abortSignal(signal),

		supabase
			.from("jobs")
			.select("id, job_number, move_date, proposals(leads(customers(name)))")
			.ilike("job_number", pattern)
			.limit(PER_GROUP_LIMIT)
			.abortSignal(signal),
		supabase
			.from("jobs")
			.select("id, job_number, move_date, proposals!inner(leads!inner(customers!inner(name)))")
			.ilike("proposals.leads.customers.name", pattern)
			.limit(PER_GROUP_LIMIT)
			.abortSignal(signal),

		supabase
			.from("proposals")
			.select("id, proposal_number, status, leads(customers(name))")
			.ilike("proposal_number", pattern)
			.limit(PER_GROUP_LIMIT)
			.abortSignal(signal),
		supabase
			.from("proposals")
			.select("id, proposal_number, status, leads!inner(customers!inner(name))")
			.ilike("leads.customers.name", pattern)
			.limit(PER_GROUP_LIMIT)
			.abortSignal(signal),

		supabase
			.from("fleet")
			.select("id, name, phone")
			.or(`name.ilike.${pattern},phone.ilike.${pattern}`)
			.limit(PER_GROUP_LIMIT)
			.abortSignal(signal),

		supabase
			.from("crew")
			.select("id, name, phone")
			.or(`name.ilike.${pattern},phone.ilike.${pattern}`)
			.limit(PER_GROUP_LIMIT)
			.abortSignal(signal),

		supabase
			.from("invoices")
			.select("id, invoice_number, jobs(job_number, proposals(leads(customers(name))))")
			.ilike("invoice_number", pattern)
			.limit(PER_GROUP_LIMIT)
			.abortSignal(signal),
	]);

	if (signal.aborted) return [];

	const hits: Hit[] = [];
	const seen = new Set<string>();

	function add(group: Group, id: string, title: string, subtitle?: string) {
		const key = `${group}:${id}`;
		if (seen.has(key)) return;
		seen.add(key);
		hits.push({
			group,
			id,
			title,
			subtitle,
			url: urlFor(group, id),
		});
	}

	for (const c of (customersRes.data ?? []) as CustomerRow[]) {
		const sub = [c.company_name, c.phone].filter(Boolean).join(" · ");
		add("customers", c.id, c.name, sub || undefined);
	}

	for (const lead of [
		...((leadsByText.data ?? []) as LeadRow[]),
		...((leadsByCustomer.data ?? []) as LeadRow[]),
	]) {
		const route =
			[lead.pickup_address, lead.destination_address].filter(Boolean).join(" → ") || "Lead";
		const title = lead.customers?.name ?? "Unknown customer";
		add("leads", lead.id, title, route);
	}

	for (const job of [
		...((jobsByNumber.data ?? []) as JobRow[]),
		...((jobsByCustomer.data ?? []) as JobRow[]),
	]) {
		const customerName = job.proposals?.leads?.customers?.name ?? "Unknown customer";
		const sub = [job.move_date, customerName].filter(Boolean).join(" · ");
		add("jobs", job.id, job.job_number, sub || undefined);
	}

	for (const p of [
		...((proposalsByNumber.data ?? []) as ProposalRow[]),
		...((proposalsByCustomer.data ?? []) as ProposalRow[]),
	]) {
		const customerName = p.leads?.customers?.name ?? "Unknown customer";
		const sub = [customerName, p.status].filter(Boolean).join(" · ");
		add("proposals", p.id, p.proposal_number, sub || undefined);
	}

	for (const v of (fleetRes.data ?? []) as FleetRow[]) {
		add("fleet", v.id, v.name, v.phone ?? undefined);
	}

	for (const c of (crewRes.data ?? []) as CrewRow[]) {
		add("crew", c.id, c.name, c.phone ?? undefined);
	}

	for (const inv of (invoicesRes.data ?? []) as InvoiceRow[]) {
		const customerName = inv.jobs?.proposals?.leads?.customers?.name ?? "Unknown customer";
		const jobNumber = inv.jobs?.job_number ?? "";
		const sub = [jobNumber, customerName].filter(Boolean).join(" · ");
		add("invoices", inv.id, inv.invoice_number, sub || undefined);
	}

	return hits;
}

function urlFor(group: Group, id: string): string {
	switch (group) {
		case "leads":
			return `/leads/${id}`;
		case "jobs":
			return `/jobs/${id}`;
		case "proposals":
			return `/proposals/${id}`;
		case "customers":
			return `/customers/${id}`;
		case "invoices":
			return `/invoices/${id}`;
		case "fleet":
			return `/fleet/${id}`;
		case "crew":
			return `/crew/${id}`;
	}
}
