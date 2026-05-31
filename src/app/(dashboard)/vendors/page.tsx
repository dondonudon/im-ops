import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function VendorsPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	const { q } = await searchParams;
	const supabase = await createClient();
	const t = await getTranslations("pages.vendors");
	const tCommon = await getTranslations("common.labels");

	let query = supabase
		.from("vendors")
		.select("id, name, contact_person, phone, vehicle_types, is_active")
		.order("name");

	if (q) query = query.ilike("name", `%${q}%`);

	const { data: vendors } = await query;

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
								{t("columns.contact")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.phone")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.vehicles")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
								{t("columns.status")}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
						{(vendors ?? []).map((v) => (
							<tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
								<td className="px-4 py-3">
									<Link
										href={`/vendors/${v.id}`}
										className="font-medium text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
									>
										{v.name}
									</Link>
								</td>
								<td className="px-4 py-3 text-gray-600 dark:text-gray-400">
									{v.contact_person ?? "—"}
								</td>
								<td className="px-4 py-3 text-gray-600 dark:text-gray-400">
									{v.phone ?? "—"}
								</td>
								<td className="px-4 py-3 text-gray-600 dark:text-gray-400">
									{(v.vehicle_types as string[] | null)?.join(", ") ?? "—"}
								</td>
								<td className="px-4 py-3">
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v.is_active ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
									>
										{v.is_active ? tCommon("active") : tCommon("inactive")}
									</span>
								</td>
							</tr>
						))}
						{(vendors ?? []).length === 0 && (
							<tr>
								<td colSpan={5} className="px-4 py-8 text-center text-gray-400">
									{t("empty")}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Mobile cards */}
			<div className="md:hidden space-y-3">
				{(vendors ?? []).map((v) => (
					<Link
						key={v.id}
						href={`/vendors/${v.id}`}
						className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
					>
						<div className="flex items-start justify-between mb-2">
							<div>
								<p className="font-semibold text-gray-900">{v.name}</p>
								{v.contact_person && (
									<p className="text-sm text-gray-500 mt-0.5">
										{v.contact_person}
									</p>
								)}
							</div>
							<span
								className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
							>
								{v.is_active ? tCommon("active") : tCommon("inactive")}
							</span>
						</div>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
							<div>
								<p className="text-xs text-gray-400">{t("columns.phone")}</p>
								<p className="text-gray-700">{v.phone ?? "—"}</p>
							</div>
							{(v.vehicle_types as string[] | null)?.length ? (
								<div>
									<p className="text-xs text-gray-400">{t("columns.vehicles")}</p>
									<p className="text-gray-700">
										{(v.vehicle_types as string[]).join(", ")}
									</p>
								</div>
							) : null}
						</div>
					</Link>
				))}
				{(vendors ?? []).length === 0 && (
					<p className="py-10 text-center text-sm text-gray-400">{t("empty")}</p>
				)}
			</div>
		</div>
	);
}
