"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
	Briefcase,
	FileText,
	Loader2,
	Receipt,
	Search,
	Truck,
	UserCheck,
	Users,
	X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────

type Group =
	| "leads"
	| "jobs"
	| "proposals"
	| "customers"
	| "vendors"
	| "crew"
	| "invoices";

type Hit = {
	id: string; // entity uuid
	group: Group;
	title: string;
	subtitle?: string;
	url: string;
};

const GROUP_META: Record<
	Group,
	{ icon: typeof Briefcase; order: number }
> = {
	leads: { icon: Search, order: 1 },
	jobs: { icon: Briefcase, order: 2 },
	proposals: { icon: FileText, order: 3 },
	customers: { icon: Users, order: 4 },
	invoices: { icon: Receipt, order: 5 },
	vendors: { icon: Truck, order: 6 },
	crew: { icon: UserCheck, order: 7 },
};

const PER_GROUP_LIMIT = 5;

// ── Query sanitization ───────────────────────────────────────────────────
// `%` and `_` are wildcards inside ILIKE — we escape them so a literal
// underscore in a phone number doesn't match everything. Parens and commas
// have meaning in PostgREST's .or() syntax, so we drop them.

function escapeLike(input: string): string {
	return input.replace(/[%_]/g, "\\$&");
}

function sanitizeForOr(input: string): string {
	// Replace PostgREST-meaningful chars with spaces.
	return input.replace(/[(),]/g, " ").trim();
}

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
		const handle = setTimeout(() => {
			void runSearch(trimmed).then((newHits) => {
				setHits(newHits);
				setActiveIdx(0);
				setLoading(false);
			});
		}, 180);
		return () => clearTimeout(handle);
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
		return Array.from(map.entries()).sort(
			([a], [b]) => GROUP_META[a].order - GROUP_META[b].order,
		);
	}, [hits]);

	const flatHits = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

	// Keep activeIdx within bounds
	useEffect(() => {
		if (activeIdx >= flatHits.length) setActiveIdx(0);
	}, [activeIdx, flatHits.length]);

	// Scroll active row into view
	useEffect(() => {
		if (!listRef.current) return;
		const node = listRef.current.querySelector<HTMLElement>(
			`[data-hit-idx="${activeIdx}"]`,
		);
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
			setActiveIdx((i) => Math.min(i + 1, Math.max(0, flatHits.length - 1)));
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIdx((i) => Math.max(i - 1, 0));
			return;
		}
		if (e.key === "Enter") {
			const hit = flatHits[activeIdx];
			if (hit) {
				e.preventDefault();
				navigateTo(hit);
			}
		}
	}

	function navigateTo(hit: Hit) {
		closePalette();
		router.push(hit.url);
	}

	// ── Render ──────────────────────────────────────────────────────────

	if (!open) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Search"
			className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-sm"
			onClick={closePalette}
		>
			<div
				className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden flex flex-col max-h-[70vh]"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Input row */}
				<div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
					<Search size={18} className="text-gray-400" aria-hidden="true" />
					<input
						ref={inputRef}
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleInputKey}
						placeholder={t("placeholder")}
						className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
						aria-label={t("placeholder")}
						autoComplete="off"
						spellCheck={false}
					/>
					{loading && (
						<Loader2
							size={14}
							className="animate-spin text-gray-400"
							aria-hidden="true"
						/>
					)}
					<button
						type="button"
						onClick={closePalette}
						aria-label="Close search"
						className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 transition-colors"
					>
						<X size={14} aria-hidden="true" />
					</button>
				</div>

				{/* Results */}
				<div
					ref={listRef}
					className="flex-1 overflow-y-auto py-2"
					role="listbox"
				>
					{!query.trim() ? (
						<EmptyHint />
					) : grouped.length === 0 && !loading ? (
						<p className="text-center text-sm text-gray-400 py-8">
							{t("noResults", { query })}
						</p>
					) : (
						grouped.map(([group, items]) => {
							const meta = GROUP_META[group];
							const Icon = meta.icon;
							return (
								<section key={group} className="py-1">
									<header className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
										{t(`groups.${group}` as never)}
									</header>
									<ul>
										{items.map((hit) => {
											const idx = flatHits.indexOf(hit);
											const active = idx === activeIdx;
											return (
												<li key={hit.id} role="option" aria-selected={active}>
													<button
														type="button"
														data-hit-idx={idx}
														onMouseEnter={() => setActiveIdx(idx)}
														onClick={() => navigateTo(hit)}
														className={`w-full text-left flex items-center gap-3 px-3 py-2 transition-colors ${
															active
																? "bg-brand-50 dark:bg-brand-900/30"
																: "hover:bg-gray-50 dark:hover:bg-gray-800"
														}`}
													>
														<Icon
															size={14}
															className={
																active
																	? "text-brand-600 dark:text-brand-400 shrink-0"
																	: "text-gray-400 shrink-0"
															}
															aria-hidden="true"
														/>
														<div className="min-w-0 flex-1">
															<p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
																{hit.title}
															</p>
															{hit.subtitle && (
																<p className="text-xs text-gray-500 dark:text-gray-400 truncate">
																	{hit.subtitle}
																</p>
															)}
														</div>
													</button>
												</li>
											);
										})}
									</ul>
								</section>
							);
						})
					)}
				</div>

				{/* Footer hints */}
				<div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400">
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
		<kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 font-mono">
			{k}
		</kbd>
	);
}

function EmptyHint() {
	const t = useTranslations("search");
	return (
		<div className="px-4 py-8 text-center text-sm text-gray-400 space-y-1">
			<p>{t("emptyHint")}</p>
			<p className="text-xs">{t("emptyScope")}</p>
		</div>
	);
}

// ── Search executor ──────────────────────────────────────────────────────

async function runSearch(raw: string): Promise<Hit[]> {
	const clean = sanitizeForOr(raw);
	if (!clean) return [];
	const pattern = `%${escapeLike(clean)}%`;
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
	type VendorRow = { id: string; name: string; phone: string | null };
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
		vendorsRes,
		crewRes,
		invoicesRes,
	] = await Promise.all([
		supabase
			.from("customers")
			.select("id, name, phone, company_name")
			.or(
				`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},company_name.ilike.${pattern}`,
			)
			.limit(PER_GROUP_LIMIT),

		supabase
			.from("leads")
			.select(
				"id, pickup_address, destination_address, customers(name)",
			)
			.or(
				`pickup_address.ilike.${pattern},destination_address.ilike.${pattern},notes.ilike.${pattern}`,
			)
			.limit(PER_GROUP_LIMIT),
		supabase
			.from("leads")
			.select(
				"id, pickup_address, destination_address, customers!inner(name)",
			)
			.ilike("customers.name", pattern)
			.limit(PER_GROUP_LIMIT),

		supabase
			.from("jobs")
			.select(
				"id, job_number, move_date, proposals(leads(customers(name)))",
			)
			.ilike("job_number", pattern)
			.limit(PER_GROUP_LIMIT),
		supabase
			.from("jobs")
			.select(
				"id, job_number, move_date, proposals!inner(leads!inner(customers!inner(name)))",
			)
			.ilike("proposals.leads.customers.name", pattern)
			.limit(PER_GROUP_LIMIT),

		supabase
			.from("proposals")
			.select("id, proposal_number, status, leads(customers(name))")
			.ilike("proposal_number", pattern)
			.limit(PER_GROUP_LIMIT),
		supabase
			.from("proposals")
			.select(
				"id, proposal_number, status, leads!inner(customers!inner(name))",
			)
			.ilike("leads.customers.name", pattern)
			.limit(PER_GROUP_LIMIT),

		supabase
			.from("vendors")
			.select("id, name, phone")
			.or(`name.ilike.${pattern},phone.ilike.${pattern}`)
			.limit(PER_GROUP_LIMIT),

		supabase
			.from("crew")
			.select("id, name, phone")
			.or(`name.ilike.${pattern},phone.ilike.${pattern}`)
			.limit(PER_GROUP_LIMIT),

		supabase
			.from("invoices")
			.select(
				"id, invoice_number, jobs(job_number, proposals(leads(customers(name))))",
			)
			.ilike("invoice_number", pattern)
			.limit(PER_GROUP_LIMIT),
	]);

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
			[lead.pickup_address, lead.destination_address]
				.filter(Boolean)
				.join(" → ") || "Lead";
		const title = lead.customers?.name ?? "Unknown customer";
		add("leads", lead.id, title, route);
	}

	for (const job of [
		...((jobsByNumber.data ?? []) as JobRow[]),
		...((jobsByCustomer.data ?? []) as JobRow[]),
	]) {
		const customerName =
			job.proposals?.leads?.customers?.name ?? "Unknown customer";
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

	for (const v of (vendorsRes.data ?? []) as VendorRow[]) {
		add("vendors", v.id, v.name, v.phone ?? undefined);
	}

	for (const c of (crewRes.data ?? []) as CrewRow[]) {
		add("crew", c.id, c.name, c.phone ?? undefined);
	}

	for (const inv of (invoicesRes.data ?? []) as InvoiceRow[]) {
		const customerName =
			inv.jobs?.proposals?.leads?.customers?.name ?? "Unknown customer";
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
		case "vendors":
			return `/vendors/${id}`;
		case "crew":
			return `/crew/${id}`;
	}
}
