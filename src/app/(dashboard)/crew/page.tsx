import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@/lib/utils";

export default async function CrewPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	const { q } = await searchParams;
	const supabase = await createClient();
	const t = await getTranslations("pages.crew");
	const tAvail = await getTranslations("entity.availability");

	let query = supabase
		.from("crew")
		.select("id, name, phone, skills, daily_rate, availability_status, is_active")
		.order("name");

	if (q) query = query.ilike("name", `%${q}%`);

	const { data: crew } = await query;

	return (
		<div className="space-y-5">
			<h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
				{t("title")}
			</h1>

			<form method="GET" role="search">
				<input
					type="search"
					name="q"
					defaultValue={q}
					placeholder={t("searchPlaceholder")}
					aria-label={t("searchPlaceholder")}
					className="w-full max-w-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
				/>
			</form>

			{/* Desktop table */}
			<div className="hidden md:block rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-x-auto">
				<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
					<thead className="bg-gray-50 dark:bg-gray-800">
						<tr>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.name")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.phone")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.dailyRate")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.availability")}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
						{(crew ?? []).map((c) => (
							<tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
								<td className="px-4 py-3">
									<Link
										href={`/crew/${c.id}`}
										className="font-medium text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
									>
										{c.name}
									</Link>
								</td>
								<td className="px-4 py-3 text-gray-600 dark:text-gray-400">
									{c.phone ?? "—"}
								</td>
								<td className="px-4 py-3 tabular-nums">
									{c.daily_rate ? formatRupiah(c.daily_rate) : "—"}
								</td>
								<td className="px-4 py-3">
									<AvailabilityChip
										status={c.availability_status}
										label={tAvail((c.availability_status ?? "available") as never)}
									/>
								</td>
							</tr>
						))}
						{(crew ?? []).length === 0 && (
							<tr>
								<td colSpan={4} className="px-4 py-8 text-center text-gray-400">
									{t("empty")}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Mobile cards */}
			<div className="md:hidden space-y-3">
				{(crew ?? []).map((c) => (
					<Link
						key={c.id}
						href={`/crew/${c.id}`}
						className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
					>
						<div className="flex items-start justify-between mb-2">
							<div>
								<p className="font-semibold text-gray-900">{c.name}</p>
								<p className="text-sm text-gray-500 mt-0.5">{c.phone ?? "—"}</p>
							</div>
							<AvailabilityChip
								status={c.availability_status}
								label={tAvail((c.availability_status ?? "available") as never)}
							/>
						</div>
						{c.daily_rate && (
							<div className="mt-2">
								<p className="text-xs text-gray-400">{t("columns.dailyRate")}</p>
								<p className="font-semibold text-gray-900 tabular-nums text-sm">
									{formatRupiah(c.daily_rate)}
								</p>
							</div>
						)}
					</Link>
				))}
				{(crew ?? []).length === 0 && (
					<p className="py-10 text-center text-sm text-gray-400">{t("empty")}</p>
				)}
			</div>
		</div>
	);
}

function AvailabilityChip({
	status,
	label,
}: {
	status: string | null;
	label: string;
}) {
	const map: Record<string, string> = {
		available:
			"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
		on_job:
			"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
		unavailable: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	};
	const s = status ?? "available";
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[s] ?? map.available}`}
		>
			{label}
		</span>
	);
}
