import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { List, Columns3 } from "lucide-react";
import { formatJobSchedule, formatRupiah, cn } from "@/lib/utils";
import {
	Badge,
	toneFor,
	Select,
	Table,
	THead,
	TH,
	TBody,
	TR,
	TD,
	PageHeader,
	EmptyState,
	Pagination,
} from "@/components/ui";

const STATUS_OPTS = [
	"",
	"scheduled",
	"in_progress",
	"completed",
	"cancelled",
] as const;

/** Board column order — the operational lifecycle of a job. */
const BOARD_STATUSES = [
	"scheduled",
	"in_progress",
	"completed",
	"closed",
	"cancelled",
] as const;

type JobRow = {
	id: string;
	job_number: string;
	status: string;
	move_date: string | null;
	move_time?: string | null;
	move_end_date?: string | null;
	revenue: number | null;
	proposals: { leads: { customers: { name: string } | null } | null } | null;
};

function customerOf(job: JobRow) {
	return job.proposals?.leads?.customers?.name ?? "—";
}

const PAGE_SIZE = 25;

export default async function JobsPage({
	searchParams,
}: {
	searchParams: Promise<{ status?: string; view?: string; page?: string }>;
}) {
	const { status, view: rawView, page: rawPage } = await searchParams;
	const view = rawView === "board" ? "board" : "list";
	const page = Math.max(1, Number(rawPage) || 1);
	const from = (page - 1) * PAGE_SIZE;
	const supabase = await createClient();
	const t = await getTranslations("pages.jobs");
	const tStatus = await getTranslations("status.job");

	let query = supabase
		.from("jobs")
		.select(
			`
      id, job_number, status, move_date, move_time, move_end_date, revenue,
      proposals(leads(customers(name)))
    `,
			{ count: "exact" },
		)
		.order("move_date", { ascending: false });

	// Status filter applies to the list view only; the board shows everything grouped.
	if (status && view === "list") query = query.filter("status", "eq", status);
	// Paginate the list view only — the board is a grouped overview.
	if (view === "list") query = query.range(from, from + PAGE_SIZE - 1);

	const { data, count } = await query;
	const jobs = (data ?? []) as JobRow[];

	return (
		<div className="space-y-5">
			<PageHeader
				title={t("title")}
				actions={<ViewToggle view={view} status={status} t={t} />}
			/>

			{view === "list" && (
				<form method="GET" role="search">
					<input type="hidden" name="view" value="list" />
					<Select
						name="status"
						defaultValue={status ?? ""}
						aria-label={t("columns.status")}
						className="w-auto"
					>
						{STATUS_OPTS.map((s) => (
							<option key={s} value={s}>
								{s === "" ? t("filterAll") : tStatus(s as never)}
							</option>
						))}
					</Select>
				</form>
			)}

			{view === "board" ? (
				<div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin snap-x">
					{BOARD_STATUSES.map((s) => {
						const items = jobs.filter((j) => j.status === s);
						const colRevenue = items.reduce(
							(sum, j) => sum + (j.revenue ?? 0),
							0,
						);
						return (
							<section
								key={s}
								className="snap-start shrink-0 w-[290px] flex flex-col rounded-xl border border-line bg-subtle"
								aria-label={tStatus(s as never)}
							>
								<div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
									<div className="flex items-center gap-2 min-w-0">
										<Badge tone={toneFor("job", s)} dot>
											{tStatus(s as never)}
										</Badge>
										<span className="text-[11px] font-bold text-ink-muted">
											{items.length}
										</span>
									</div>
									{colRevenue > 0 && (
										<span className="text-[11px] font-semibold text-ink-muted tabular-nums shrink-0">
											{formatRupiah(colRevenue)}
										</span>
									)}
								</div>
								<div className="flex-1 p-2.5 space-y-2.5 min-h-[120px]">
									{items.length === 0 ? (
										<p className="px-2 py-6 text-center text-xs text-ink-faint">
											—
										</p>
									) : (
										items.map((job) => (
											<Link
												key={job.id}
												href={`/jobs/${job.id}`}
												className="block rounded-lg bg-surface border border-line shadow-token-sm p-3 transition-all hover:border-line-strong hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
											>
												<div className="flex items-center justify-between gap-2 mb-1">
													<span className="font-mono text-xs font-bold text-ink">
														{job.job_number}
													</span>
													{job.revenue != null && (
														<span className="text-xs font-semibold text-ink tabular-nums">
															{formatRupiah(job.revenue)}
														</span>
													)}
												</div>
												<p className="text-[13px] font-semibold text-ink truncate">
													{customerOf(job)}
												</p>
												<p className="text-xs text-ink-faint mt-0.5">
													{job.move_date
														? formatJobSchedule(
																job.move_date,
																job.move_time,
																job.move_end_date,
															)
														: "—"}
												</p>
											</Link>
										))
									)}
								</div>
							</section>
						);
					})}
				</div>
			) : (
				<>
					{/* Desktop table */}
					<div className="hidden md:block">
						<Table>
							<THead>
								<TH>{t("columns.jobNumber")}</TH>
								<TH>{t("columns.customer")}</TH>
								<TH>{t("columns.date")}</TH>
								<TH align="right">{t("columns.revenue")}</TH>
								<TH>{t("columns.status")}</TH>
							</THead>
							<TBody>
								{jobs.map((job) => (
									<TR key={job.id}>
										<TD>
											<Link
												href={`/jobs/${job.id}`}
												className="font-mono text-xs text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
											>
												{job.job_number}
											</Link>
										</TD>
										<TD>{customerOf(job)}</TD>
										<TD className="text-ink-muted">
											{job.move_date
												? formatJobSchedule(
														job.move_date,
														job.move_time,
														job.move_end_date,
													)
												: "—"}
										</TD>
										<TD align="right">
											{job.revenue ? formatRupiah(job.revenue) : "—"}
										</TD>
										<TD>
											<Badge tone={toneFor("job", job.status)} dot>
												{tStatus(job.status as never)}
											</Badge>
										</TD>
									</TR>
								))}
								{jobs.length === 0 && (
									<TR>
										<TD colSpan={5}>
											<EmptyState title={t("empty")} />
										</TD>
									</TR>
								)}
							</TBody>
						</Table>
					</div>

					{/* Mobile cards */}
					<div className="md:hidden space-y-3">
						{jobs.map((job) => (
							<Link
								key={job.id}
								href={`/jobs/${job.id}`}
								className="block bg-surface rounded-xl border border-line p-4 shadow-token active:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
							>
								<div className="flex items-start justify-between mb-2">
									<div>
										<p className="font-mono text-xs text-ink-faint">
											{job.job_number}
										</p>
										<p className="font-semibold text-ink mt-0.5">
											{customerOf(job)}
										</p>
									</div>
									<Badge tone={toneFor("job", job.status)} dot>
										{tStatus(job.status as never)}
									</Badge>
								</div>
								<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
									<div>
										<p className="text-xs text-ink-faint">{t("columns.date")}</p>
										<p className="text-ink-muted">
											{job.move_date
												? formatJobSchedule(
														job.move_date,
														job.move_time,
														job.move_end_date,
													)
												: "—"}
										</p>
									</div>
									<div>
										<p className="text-xs text-ink-faint">
											{t("columns.revenue")}
										</p>
										<p className="font-semibold text-ink tabular-nums">
											{job.revenue ? formatRupiah(job.revenue) : "—"}
										</p>
									</div>
								</div>
							</Link>
						))}
						{jobs.length === 0 && (
							<p className="py-10 text-center text-sm text-ink-faint">
								{t("empty")}
							</p>
						)}
					</div>

					<Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
				</>
			)}
		</div>
	);
}

function ViewToggle({
	view,
	status,
	t,
}: {
	view: "list" | "board";
	status?: string;
	t: Awaited<ReturnType<typeof getTranslations>>;
}) {
	const statusQS = status ? `&status=${status}` : "";
	const base =
		"inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md transition-colors";
	return (
		<div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
			<Link
				href={`/jobs?view=list${statusQS}`}
				aria-current={view === "list" ? "page" : undefined}
				className={cn(
					base,
					view === "list"
						? "bg-primary text-primary-fg"
						: "text-ink-muted hover:text-ink",
				)}
			>
				<List size={14} aria-hidden="true" />
				{t("viewList")}
			</Link>
			<Link
				href="/jobs?view=board"
				aria-current={view === "board" ? "page" : undefined}
				className={cn(
					base,
					view === "board"
						? "bg-primary text-primary-fg"
						: "text-ink-muted hover:text-ink",
				)}
			>
				<Columns3 size={14} aria-hidden="true" />
				{t("viewBoard")}
			</Link>
		</div>
	);
}
