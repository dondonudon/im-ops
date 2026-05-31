import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";
import {
	StatusChip,
	leadStatusVariant,
} from "@/components/shared/StatusChip";

const STATUS_VALUES = [
	"",
	"new",
	"survey_scheduled",
	"survey_done",
	"estimating",
	"proposal_sent",
	"converted",
	"closed_lost",
] as const;

export default async function LeadsPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; status?: string }>;
}) {
	const { q, status } = await searchParams;
	const supabase = await createClient();
	const t = await getTranslations("pages.leads");
	const tStatus = await getTranslations("status.lead");
	const tCommon = await getTranslations("common.buttons");

	let query = supabase
		.from("leads")
		.select(`
      id, status, pickup_address, destination_address, preferred_date, created_at,
      customers(id, name, phone)
    `)
		.order("created_at", { ascending: false });

	if (status) query = query.filter("status", "eq", status);
	if (q) {
		query = query.or(
			`pickup_address.ilike.%${q}%,destination_address.ilike.%${q}%`,
		);
	}

	const { data: leads } = await query;

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
				{t("title")}
			</h1>

			{/* Filters */}
			<form method="GET" className="flex flex-wrap gap-3" role="search">
				<input
					type="search"
					name="q"
					defaultValue={q}
					placeholder={t("searchPlaceholder")}
					aria-label={t("searchPlaceholder")}
					className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
				/>
				<select
					name="status"
					defaultValue={status ?? ""}
					aria-label={t("title")}
					className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
				>
					{STATUS_VALUES.map((s) => (
						<option key={s} value={s}>
							{s === "" ? t("filterAll") : tStatus(s as never)}
						</option>
					))}
				</select>
				<button
					type="submit"
					className="rounded-lg bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
				>
					{tCommon("filter")}
				</button>
			</form>

			{/* List */}
			<div className="space-y-2">
				{(leads ?? []).map((lead) => {
					const customer = lead.customers as {
						id: string;
						name: string;
						phone: string | null;
					} | null;
					return (
						<Link
							key={lead.id}
							href={`/leads/${lead.id}`}
							className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
						>
							<div className="min-w-0 flex-1">
								<p className="font-semibold text-gray-900 dark:text-white truncate">
									{customer?.name ?? "—"}
								</p>
								<p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
									{lead.pickup_address ?? "—"} →{" "}
									{lead.destination_address ?? "—"}
								</p>
							</div>
							<div className="flex items-center gap-4 ml-4 shrink-0">
								<StatusChip
									label={tStatus(lead.status as never)}
									variant={leadStatusVariant(lead.status)}
								/>
								<span className="text-sm font-medium text-gray-500 dark:text-gray-400">
									{lead.preferred_date
										? formatDate(lead.preferred_date)
										: formatDate(lead.created_at)}
								</span>
							</div>
						</Link>
					);
				})}
				{(leads ?? []).length === 0 && (
					<p className="py-10 text-center text-sm text-gray-400">
						{q || status ? t("emptyFiltered") : t("empty")}
					</p>
				)}
			</div>
		</div>
	);
}
