import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";

/**
 * Customer list page — shows all customers with a link to create new.
 */
export default async function CustomersPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	const { q } = await searchParams;
	const supabase = await createClient();
	const t = await getTranslations("pages.customers");
	const tType = await getTranslations("entity.customerType");

	let query = supabase
		.from("customers")
		.select("id, name, phone, email, type, company_name, created_at")
		.order("created_at", { ascending: false });

	if (q) {
		query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
	}

	const { data: customers } = await query;

	return (
		<div className="space-y-5">
			<h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
				{t("title")}
			</h1>

			{/* Search */}
			<form method="GET" role="search">
				<input
					type="search"
					name="q"
					defaultValue={q}
					placeholder={t("searchPlaceholder")}
					aria-label={t("searchPlaceholder")}
					className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
				/>
			</form>

			{/* Desktop table */}
			<div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
				<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
					<thead className="bg-gray-50 dark:bg-gray-800">
						<tr>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
								{t("columns.name")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
								{t("columns.phone")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
								{t("columns.type")}
							</th>
							<th scope="col" className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
								{t("columns.since")}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
						{(customers ?? []).map((c) => (
							<tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
								<td className="px-4 py-3 font-medium">
									<Link
										href={`/customers/${c.id}`}
										className="text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
									>
										{c.name}
										{c.company_name && (
											<span className="ml-1 text-xs text-gray-400">
												({c.company_name})
											</span>
										)}
									</Link>
								</td>
								<td className="px-4 py-3 text-gray-600 dark:text-gray-400">
									{c.phone ?? "—"}
								</td>
								<td className="px-4 py-3 text-gray-600 dark:text-gray-400">
									{tType(c.type as never)}
								</td>
								<td className="px-4 py-3 text-gray-500 dark:text-gray-500">
									{formatDate(c.created_at)}
								</td>
							</tr>
						))}
						{(customers ?? []).length === 0 && (
							<tr>
								<td colSpan={4} className="px-4 py-8 text-center text-gray-400">
									{q ? t("emptyFiltered") : t("empty")}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Mobile cards */}
			<div className="md:hidden space-y-3">
				{(customers ?? []).map((c) => (
					<Link
						key={c.id}
						href={`/customers/${c.id}`}
						className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
					>
						<div className="flex items-start justify-between">
							<div>
								<p className="font-semibold text-gray-900">{c.name}</p>
								{c.company_name && (
									<p className="text-xs text-gray-400 mt-0.5">{c.company_name}</p>
								)}
							</div>
							<span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
								{tType(c.type as never)}
							</span>
						</div>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
							<div>
								<p className="text-xs text-gray-400">{t("columns.phone")}</p>
								<p className="text-gray-700">{c.phone ?? "—"}</p>
							</div>
							<div>
								<p className="text-xs text-gray-400">{t("columns.since")}</p>
								<p className="text-gray-700">{formatDate(c.created_at)}</p>
							</div>
						</div>
					</Link>
				))}
				{(customers ?? []).length === 0 && (
					<p className="py-10 text-center text-sm text-gray-400">
						{q ? t("emptyFiltered") : t("empty")}
					</p>
				)}
			</div>
		</div>
	);
}
