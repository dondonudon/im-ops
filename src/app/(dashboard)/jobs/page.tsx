import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatJobSchedule, formatRupiah } from "@/lib/utils";
import { StatusChip, jobStatusVariant } from "@/components/shared/StatusChip";

const STATUS_OPTS = [
	"",
	"scheduled",
	"in_progress",
	"completed",
	"cancelled",
] as const;

export default async function JobsPage({
	searchParams,
}: {
	searchParams: Promise<{ status?: string }>;
}) {
	const { status } = await searchParams;
	const supabase = await createClient();
	const t = await getTranslations("pages.jobs");
	const tStatus = await getTranslations("status.job");

	let query = supabase
		.from("jobs")
		.select(`
      id, job_number, status, move_date, move_time, move_end_date, revenue,
      proposals(
        leads(customers(name))
      )
    `)
		.order("move_date", { ascending: false });

	if (status) query = query.filter("status", "eq", status);

	const { data: jobs } = await query;

	return (
		<div className="space-y-5">
			<h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
				{t("title")}
			</h1>

			<form method="GET" role="search">
				<select
					name="status"
					defaultValue={status ?? ""}
					aria-label={t("columns.status")}
					className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
				>
					{STATUS_OPTS.map((s) => (
						<option key={s} value={s}>
							{s === "" ? t("filterAll") : tStatus(s as never)}
						</option>
					))}
				</select>
			</form>

			{/* Desktop table */}
			<div className="hidden md:block rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-x-auto">
				<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
					<thead className="bg-gray-50 dark:bg-gray-800">
						<tr>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.jobNumber")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.customer")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.date")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.revenue")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.status")}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
						{(jobs ?? []).map((job) => {
							const customer = (
								job.proposals as {
									leads: { customers: { name: string } | null } | null;
								} | null
							)?.leads?.customers;
							return (
								<tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
									<td className="px-4 py-3 font-mono text-xs">
										<Link
											href={`/jobs/${job.id}`}
											className="text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
										>
											{job.job_number}
										</Link>
									</td>
									<td className="px-4 py-3">{customer?.name ?? "—"}</td>
									<td className="px-4 py-3 text-gray-500">
										{job.move_date
											? formatJobSchedule(
													job.move_date,
													(job as { move_time?: string | null }).move_time,
													(job as { move_end_date?: string | null }).move_end_date,
												)
											: "—"}
									</td>
									<td className="px-4 py-3 tabular-nums">
										{job.revenue ? formatRupiah(job.revenue) : "—"}
									</td>
									<td className="px-4 py-3">
										<StatusChip
											label={tStatus(job.status as never)}
											variant={jobStatusVariant(job.status)}
										/>
									</td>
								</tr>
							);
						})}
						{(jobs ?? []).length === 0 && (
							<tr>
								<td colSpan={6} className="px-4 py-8 text-center text-gray-400">
									{t("empty")}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Mobile cards */}
			<div className="md:hidden space-y-3">
				{(jobs ?? []).map((job) => {
					const customer = (
						job.proposals as {
							leads: { customers: { name: string } | null } | null;
						} | null
					)?.leads?.customers;
					return (
						<Link
							key={job.id}
							href={`/jobs/${job.id}`}
							className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
						>
							<div className="flex items-start justify-between mb-2">
								<div>
									<p className="font-mono text-xs text-gray-400">{job.job_number}</p>
									<p className="font-semibold text-gray-900 mt-0.5">
										{customer?.name ?? "—"}
									</p>
								</div>
								<StatusChip
									label={tStatus(job.status as never)}
									variant={jobStatusVariant(job.status)}
								/>
							</div>
							<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
								<div>
									<p className="text-xs text-gray-400">{t("columns.date")}</p>
									<p className="text-gray-700">
										{job.move_date
											? formatJobSchedule(
													job.move_date,
													(job as { move_time?: string | null }).move_time,
													(job as { move_end_date?: string | null }).move_end_date,
												)
											: "—"}
									</p>
								</div>
								<div>
									<p className="text-xs text-gray-400">{t("columns.revenue")}</p>
									<p className="font-semibold text-gray-900 tabular-nums">
										{job.revenue ? formatRupiah(job.revenue) : "—"}
									</p>
								</div>
							</div>
						</Link>
					);
				})}
				{(jobs ?? []).length === 0 && (
					<p className="py-10 text-center text-sm text-gray-400">{t("empty")}</p>
				)}
			</div>
		</div>
	);
}
