import {
	AlertTriangle,
	ArrowRight,
	CalendarDays,
	CalendarX,
	CheckCircle2,
	ClipboardCheck,
	Clock,
	FileText,
	Receipt,
	Send,
	Truck,
} from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PendingLink } from "@/components/shared/PendingLink";
import {
	Badge,
	buttonStyles,
	Card,
	CardHeader,
	EmptyState,
	Money,
	PageHeader,
	RouteLine,
	Stat,
	toneFor,
} from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRupiah } from "@/lib/utils";

function startOfMonth() {
	const d = new Date();
	return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}
function todayISO() {
	return new Date().toISOString().split("T")[0];
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type TodayJob = {
	id: string;
	job_number: string;
	status: string;
	move_date: string;
	proposals: {
		leads: {
			pickup_address: string | null;
			destination_address: string | null;
			destination_address_2: string | null;
			customers: { name: string } | null;
		} | null;
	} | null;
};

/**
 * TODAY — the redesigned operator home (replaces the old KPI dashboard).
 * A triage surface: what needs you → today's moves → at a glance → money.
 * Fully token-driven (no dark: variants), responsive desktop + field.
 *
 * Streaming strategy: above-the-fold content (moves + needs-you queue) is
 * fetched eagerly (5 parallel queries). Secondary sections (money card, KPI
 * stats, upcoming jobs) are deferred behind Suspense so they stream in without
 * blocking the page shell.
 */
export default async function TodayPage() {
	const t = await getTranslations("today");
	const locale = await getLocale();
	const supabase = await createClient();
	const today = todayISO();

	// ── Eager fetch: above-the-fold data only ───────────────────────────────
	const [
		{ data: arTotals },
		{ data: overdueInvoices },
		{ data: todaysMoves },
		{ data: pendingSurveys },
		{ data: draftProposals },
		{ data: syncFailures },
	] = await Promise.all([
		// Server-side aggregate: no row count cap — totals are always accurate
		supabase.rpc("get_ar_totals").single(),
		// Fetch only overdue invoices (id + amount) needed for the action queue
		supabase
			.from("invoice_outstanding")
			.select("id, outstanding")
			.eq("effective_status", "overdue")
			.order("due_date")
			.limit(20),
		supabase
			.from("jobs")
			.select(
				"id, job_number, status, move_date, proposals(leads(pickup_address, destination_address, destination_address_2, customers(name)))",
			)
			.eq("move_date", today)
			.order("status"),
		supabase
			.from("leads")
			.select("id, pickup_address, customers(name)")
			.eq("status", "survey_scheduled")
			.order("created_at")
			.limit(5),
		supabase
			.from("proposals")
			.select("id, proposal_number")
			.eq("status", "draft")
			.order("created_at")
			.limit(5),
		supabase
			.from("jobs")
			.select("id, job_number")
			.is("gcal_event_id", null)
			.in("status", ["scheduled", "in_progress"])
			.gte("move_date", today)
			.limit(5),
	]);

	const overdue = (overdueInvoices ?? []) as { id: string; outstanding: number }[];
	const totalOutstanding = Number(arTotals?.total_outstanding ?? 0);
	const overdueAmount = Number(arTotals?.overdue_amount ?? 0);
	const moves = (todaysMoves ?? []) as TodayJob[];

	// ── Build the "Needs you" action queue ──────────────────────────────────
	type Item = {
		id: string;
		icon: React.ReactNode;
		tone: "info" | "pending" | "danger" | "positive";
		title: string;
		sub: string;
		action: string;
		href: string;
	};
	const queue: Item[] = [
		...(pendingSurveys ?? []).map((l) => ({
			id: `survey-${l.id}`,
			icon: <ClipboardCheck size={16} />,
			tone: "pending" as const,
			title: t("queue.surveyDue"),
			sub: (l.customers as { name: string } | null)?.name ?? l.pickup_address ?? "—",
			action: t("queue.review"),
			href: `/leads/${l.id}`,
		})),
		...(draftProposals ?? []).map((p) => ({
			id: `proposal-${p.id}`,
			icon: <Send size={16} />,
			tone: "info" as const,
			title: t("queue.proposalReady"),
			sub: p.proposal_number,
			action: t("queue.send"),
			href: `/proposals/${p.id}`,
		})),
		...overdue.slice(0, 5).map((inv) => ({
			id: `overdue-${inv.id}`,
			icon: <AlertTriangle size={16} />,
			tone: "danger" as const,
			title: t("queue.invoiceOverdue"),
			sub: formatRupiah(inv.outstanding ?? 0),
			action: t("queue.collect"),
			href: `/invoices/${inv.id}`,
		})),
		...(syncFailures ?? []).map((j) => ({
			id: `sync-${j.id}`,
			icon: <CalendarX size={16} />,
			tone: "pending" as const,
			title: t("queue.syncFailed"),
			sub: `#${j.job_number}`,
			action: t("queue.fix"),
			href: `/jobs/${j.id}`,
		})),
	];

	const now = new Date();
	const headerDate = now.toLocaleDateString(locale, {
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	return (
		<div className="space-y-6 animate-fade-in-up">
			<PageHeader
				title={t("title")}
				subtitle={
					queue.length > 0
						? t("subtitleNeeds", { count: queue.length, date: headerDate })
						: t("subtitleClear", { date: headerDate })
				}
				actions={
					<Link href="/pipeline" className={buttonStyles({ variant: "secondary", size: "md" })}>
						{t("openPipeline")}
						<ArrowRight size={15} />
					</Link>
				}
			/>

			{/* ── Today's moves strip ─────────────────────────────────────────── */}
			<section>
				<div className="flex items-center gap-2 mb-3">
					<Truck size={16} className="text-primary" />
					<h2 className="text-sm font-semibold text-ink">{t("todaysMoves")}</h2>
					<span className="text-xs text-ink-faint">({moves.length})</span>
				</div>
				{moves.length === 0 ? (
					<Card className="px-5 py-8">
						<EmptyState
							icon={<CalendarDays size={26} />}
							title={t("noMovesToday")}
							className="py-0"
						/>
					</Card>
				) : (
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{moves.map((job) => {
							const lead = job.proposals?.leads ?? null;
							return (
								<PendingLink
									key={job.id}
									href={`/jobs/${job.id}`}
									className="group bg-surface border border-line rounded-xl shadow-token p-4 transition-all hover:border-line-strong hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
								>
									<div className="flex items-center justify-between mb-3">
										<span className="font-mono text-sm font-bold text-ink group-hover:text-primary transition-colors">
											#{job.job_number}
										</span>
										<Badge tone={toneFor("job", job.status)} dot>
											{job.status.replace("_", " ")}
										</Badge>
									</div>
									<p className="text-sm font-semibold text-ink truncate mb-2">
										{lead?.customers?.name ?? "—"}
									</p>
									<RouteLine
										from={lead?.pickup_address}
										via={lead?.destination_address_2}
										to={lead?.destination_address}
									/>
								</PendingLink>
							);
						})}
					</div>
				)}
			</section>

			{/* ── Main grid: Needs you (lead) + Money (rail) ──────────────────── */}
			<div className="grid gap-5 xl:grid-cols-3">
				{/* Needs you — eagerly rendered */}
				<Card className="xl:col-span-2 overflow-hidden">
					<CardHeader
						title={
							<span className="flex items-center gap-2">
								{t("needsYou")}
								{queue.length > 0 && (
									<span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-fg">
										{queue.length}
									</span>
								)}
							</span>
						}
					/>
					{queue.length === 0 ? (
						<EmptyState
							icon={<CheckCircle2 size={30} className="text-success" />}
							title={t("allClear")}
							hint={t("allClearHint")}
						/>
					) : (
						<ul className="divide-y divide-line">
							{queue.map((item) => (
								<li key={item.id} className="flex items-center gap-3 px-5 py-3.5">
									<span
										className={`${
											{
												info: "text-primary bg-primary-subtle",
												pending: "text-warning bg-warning-bg",
												danger: "text-danger bg-danger-bg",
												positive: "text-success bg-success-bg",
											}[item.tone]
										} flex h-9 w-9 items-center justify-center rounded-lg shrink-0`}
									>
										{item.icon}
									</span>
									<div className="flex-1 min-w-0">
										<p className="text-[13px] font-semibold text-ink truncate">{item.title}</p>
										<p className="text-xs text-ink-muted truncate">{item.sub}</p>
									</div>
									<PendingLink
										href={item.href}
										className={buttonStyles({
											variant: item.tone === "danger" ? "danger" : "subtle",
											size: "sm",
										})}
									>
										{item.action}
									</PendingLink>
								</li>
							))}
						</ul>
					)}
				</Card>

				{/* Money this month — deferred */}
				<Suspense fallback={<MoneyCardSkeleton />}>
					<MoneyCardSection />
				</Suspense>
			</div>

			{/* ── At a glance — deferred ──────────────────────────────────────── */}
			<section>
				<h2 className="text-sm font-semibold text-ink mb-3">{t("atAGlance")}</h2>
				<Suspense fallback={<AtAGlanceSkeleton />}>
					<AtAGlanceSection
						movesCount={moves.length}
						outstandingCount={Number(arTotals?.outstanding_count ?? 0)}
						totalOutstanding={totalOutstanding}
						overdueCount={Number(arTotals?.overdue_count ?? 0)}
						overdueAmount={overdueAmount}
					/>
				</Suspense>
			</section>

			{/* ── Upcoming — deferred ─────────────────────────────────────────── */}
			<Suspense fallback={<UpcomingSkeleton />}>
				<UpcomingSection />
			</Suspense>
		</div>
	);
}

// ── Deferred async sections ─────────────────────────────────────────────────

async function MoneyCardSection() {
	const t = await getTranslations("today");
	const supabase = await createClient();
	const monthStart = startOfMonth();

	const [{ data: monthlyPaid }, { data: monthlyExp }, { data: revenueTargetSetting }] =
		await Promise.all([
			supabase
				.from("invoices")
				.select("paid_amount")
				.in("status", ["paid", "partially_paid"])
				.gte("created_at", monthStart),
			supabase.from("expenses").select("amount").gte("incurred_at", monthStart),
			supabase
				.from("system_settings")
				.select("value")
				.eq("key", "revenue_target_monthly")
				.maybeSingle(),
		]);

	const monthRevenue = (monthlyPaid ?? []).reduce((s, i) => s + (i.paid_amount ?? 0), 0);
	const monthExpenses = (monthlyExp ?? []).reduce((s, i) => s + (i.amount ?? 0), 0);
	const net = monthRevenue - monthExpenses;
	const revenueTarget = revenueTargetSetting?.value
		? Number(revenueTargetSetting.value)
		: 50_000_000;
	const revenueProgress = Math.min(100, Math.round((monthRevenue / revenueTarget) * 100));

	return (
		<Card className="p-5 flex flex-col gap-4">
			<h2 className="text-sm font-semibold text-ink">{t("money")}</h2>

			<div>
				<div className="flex justify-between text-xs text-ink-muted mb-1.5">
					<span>{t("revenueTarget")}</span>
					<span className="font-semibold text-ink tabular-nums">
						{formatRupiah(monthRevenue)} / {formatRupiah(revenueTarget)}
					</span>
				</div>
				<div
					className="h-2 rounded-full bg-subtle overflow-hidden"
					role="progressbar"
					aria-valuenow={revenueProgress}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div
						className="h-full rounded-full bg-primary transition-all duration-700"
						style={{ width: `${revenueProgress}%` }}
					/>
				</div>
				<p className="text-[11px] text-ink-faint mt-1">{t("ofTarget", { pct: revenueProgress })}</p>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<div className="bg-subtle rounded-lg p-3">
					<p className="text-xs text-ink-muted mb-1">{t("revenue")}</p>
					<Money value={monthRevenue} tone="positive" className="text-base font-bold" />
				</div>
				<div className="bg-subtle rounded-lg p-3">
					<p className="text-xs text-ink-muted mb-1">{t("expenses")}</p>
					<Money value={monthExpenses} tone="danger" className="text-base font-bold" />
				</div>
			</div>

			<div className="flex items-center justify-between border-t border-line pt-3">
				<span className="text-xs text-ink-muted">{t("net")}</span>
				<Money value={net} tone={net >= 0 ? "positive" : "danger"} className="text-sm font-bold" />
			</div>

			<Link
				href="/reports"
				className="mt-auto text-center text-xs font-semibold text-primary-text hover:underline"
			>
				{t("viewReport")}
			</Link>
		</Card>
	);
}

async function AtAGlanceSection({
	movesCount,
	outstandingCount,
	totalOutstanding,
	overdueCount,
	overdueAmount,
}: {
	movesCount: number;
	outstandingCount: number;
	totalOutstanding: number;
	overdueCount: number;
	overdueAmount: number;
}) {
	const t = await getTranslations("today");
	const supabase = await createClient();

	const [{ count: activeJobsCount }, { count: openProposalsCount }] = await Promise.all([
		supabase
			.from("jobs")
			.select("*", { count: "exact", head: true })
			.in("status", ["scheduled", "in_progress"]),
		supabase
			.from("proposals")
			.select("*", { count: "exact", head: true })
			.in("status", ["draft", "sent", "negotiating"]),
	]);

	return (
		<div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
			<Stat
				icon={<Truck size={16} />}
				tone="info"
				label={t("kpi.activeJobs")}
				value={String(activeJobsCount ?? 0)}
				sub={t("kpi.activeJobsSub", { count: movesCount })}
				href="/jobs"
			/>
			<Stat
				icon={<FileText size={16} />}
				tone="pending"
				label={t("kpi.openProposals")}
				value={String(openProposalsCount ?? 0)}
				sub={t("kpi.openProposalsSub")}
				href="/proposals"
			/>
			<Stat
				icon={<Receipt size={16} />}
				tone={overdueCount > 0 ? "danger" : "neutral"}
				label={t("kpi.unpaid")}
				value={String(outstandingCount)}
				sub={
					overdueCount > 0
						? t("kpi.overdueSub", { amount: formatRupiah(overdueAmount) })
						: t("kpi.outstandingSub", { amount: formatRupiah(totalOutstanding) })
				}
				href="/invoices"
			/>
			<Stat
				icon={<CalendarDays size={16} />}
				tone="info"
				label={t("kpi.movesToday")}
				value={String(movesCount)}
				sub={t("kpi.movesTodaySub")}
				href="/calendar"
			/>
		</div>
	);
}

async function UpcomingSection() {
	const t = await getTranslations("today");
	const supabase = await createClient();
	const today = todayISO();

	const { data: upcomingJobs } = await supabase
		.from("jobs")
		.select("id, job_number, move_date, status")
		.gt("move_date", today)
		.in("status", ["scheduled", "in_progress"])
		.order("move_date")
		.limit(5);

	return (
		<Card className="overflow-hidden">
			<CardHeader
				title={t("upcoming")}
				action={
					<Link
						href="/calendar"
						className="text-xs font-semibold text-primary-text hover:underline flex items-center gap-1"
					>
						{t("viewCalendar")}
						<CalendarDays size={13} />
					</Link>
				}
			/>
			{(upcomingJobs ?? []).length === 0 ? (
				<EmptyState title={t("noUpcoming")} />
			) : (
				<ul className="divide-y divide-line">
					{(upcomingJobs ?? []).map((job) => {
						const d = new Date(`${job.move_date}T00:00:00`);
						return (
							<li key={job.id}>
								<PendingLink
									href={`/jobs/${job.id}`}
									className="flex items-center gap-4 px-5 py-3.5 hover:bg-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
								>
									<div className="shrink-0 w-11 text-center rounded-lg bg-subtle py-1">
										<p className="text-[10px] font-bold uppercase text-primary">
											{MONTH[d.getMonth()]}
										</p>
										<p className="text-lg font-bold leading-none text-ink">{d.getDate()}</p>
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-[13px] font-semibold text-ink truncate">#{job.job_number}</p>
										<p className="text-xs text-ink-faint flex items-center gap-1">
											<Clock size={10} />
											{formatDate(job.move_date)}
										</p>
									</div>
									<Badge tone={toneFor("job", job.status)} dot>
										{job.status.replace("_", " ")}
									</Badge>
								</PendingLink>
							</li>
						);
					})}
				</ul>
			)}
		</Card>
	);
}

// ── Skeleton fallbacks ──────────────────────────────────────────────────────

function MoneyCardSkeleton() {
	return (
		<div className="rounded-xl border border-line bg-surface p-5 flex flex-col gap-4 animate-pulse">
			<div className="h-4 w-28 bg-subtle rounded" />
			<div className="space-y-2">
				<div className="h-2 bg-subtle rounded-full" />
				<div className="h-2 w-3/4 bg-subtle rounded-full" />
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div className="h-16 bg-subtle rounded-lg" />
				<div className="h-16 bg-subtle rounded-lg" />
			</div>
			<div className="h-4 w-20 bg-subtle rounded" />
		</div>
	);
}

function AtAGlanceSkeleton() {
	return (
		<div className="grid grid-cols-2 xl:grid-cols-4 gap-4 animate-pulse">
			{[0, 1, 2, 3].map((i) => (
				<div key={i} className="rounded-xl border border-line bg-surface p-4 h-24" />
			))}
		</div>
	);
}

function UpcomingSkeleton() {
	return (
		<div className="rounded-xl border border-line bg-surface overflow-hidden animate-pulse">
			<div className="px-5 py-4 border-b border-line h-12 bg-subtle" />
			{[0, 1, 2].map((i) => (
				<div key={i} className="flex gap-4 px-5 py-4 border-b border-line last:border-0">
					<div className="w-11 h-12 bg-subtle rounded-lg shrink-0" />
					<div className="flex-1 space-y-2 py-1">
						<div className="h-3 w-24 bg-subtle rounded" />
						<div className="h-2 w-16 bg-subtle rounded" />
					</div>
				</div>
			))}
		</div>
	);
}
