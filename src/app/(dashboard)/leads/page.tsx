import { getTranslations } from "next-intl/server";
import { FilterForm } from "@/components/shared/FilterForm";
import { PendingLink } from "@/components/shared/PendingLink";
import {
	Badge,
	Button,
	EmptyState,
	Input,
	PageHeader,
	Pagination,
	RouteLine,
	Select,
	toneFor,
} from "@/components/ui";
import { PAGE_SIZE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { formatDate, sanitizeSearch } from "@/lib/utils";

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
	searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
	const { q, status, page: rawPage } = await searchParams;
	const page = Math.max(1, Number(rawPage) || 1);
	const from = (page - 1) * PAGE_SIZE;
	const supabase = await createClient();
	const t = await getTranslations("pages.leads");
	const tStatus = await getTranslations("status.lead");
	const tCommon = await getTranslations("common.buttons");

	let query = supabase.from("leads").select(
		`
      id, status, pickup_address, destination_address, destination_address_2, preferred_date, created_at,
      customers(id, name, phone)
    `,
		{ count: "exact" },
	);

	if (status) query = query.filter("status", "eq", status);
	if (q) {
		const safe = sanitizeSearch(q);
		const { data: matchedCustomers } = await supabase
			.from("customers")
			.select("id")
			.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
		const customerIds = (matchedCustomers ?? []).map((c) => c.id);
		const orParts = [
			`pickup_address.ilike.%${safe}%`,
			`destination_address.ilike.%${safe}%`,
			`destination_address_2.ilike.%${safe}%`,
		];
		if (customerIds.length) {
			orParts.push(`customer_id.in.(${customerIds.join(",")})`);
		}
		query = query.or(orParts.join(","));
	}

	const { data: leads, count } = await query
		.order("created_at", { ascending: false })
		.range(from, from + PAGE_SIZE - 1);

	return (
		<div className="space-y-5">
			<PageHeader title={t("title")} />

			{/* Filters */}
			<search>
				<FilterForm className="flex flex-wrap gap-2">
					<Input
						type="search"
						name="q"
						defaultValue={q}
						placeholder={t("searchPlaceholder")}
						aria-label={t("searchPlaceholder")}
						className="w-auto min-w-[220px] flex-1 max-w-xs"
					/>
					<Select
						name="status"
						defaultValue={status ?? ""}
						aria-label={t("title")}
						className="w-auto"
					>
						{STATUS_VALUES.map((s) => (
							<option key={s} value={s}>
								{s === "" ? t("filterAll") : tStatus(s as never)}
							</option>
						))}
					</Select>
					<Button type="submit" variant="secondary">
						{tCommon("filter")}
					</Button>
				</FilterForm>
			</search>

			{/* List */}
			<div className="space-y-2">
				{(leads ?? []).map((lead) => {
					const customer = lead.customers as {
						id: string;
						name: string;
						phone: string | null;
					} | null;
					return (
						<PendingLink
							key={lead.id}
							href={`/leads/${lead.id}`}
							className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface shadow-token px-5 py-4 transition-all hover:border-line-strong hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
						>
							<div className="min-w-0 flex-1">
								<p className="font-semibold text-ink truncate">{customer?.name ?? "—"}</p>
								<RouteLine
									from={lead.pickup_address}
									via={(lead as { destination_address_2?: string | null }).destination_address_2}
									to={lead.destination_address}
									className="mt-1.5"
								/>
							</div>
							<div className="flex items-center gap-4 shrink-0">
								<Badge tone={toneFor("lead", lead.status)} dot>
									{tStatus(lead.status as never)}
								</Badge>
								<span className="hidden sm:block text-sm font-medium text-ink-muted tabular-nums">
									{lead.preferred_date
										? formatDate(lead.preferred_date)
										: formatDate(lead.created_at)}
								</span>
							</div>
						</PendingLink>
					);
				})}
				{(leads ?? []).length === 0 && (
					<EmptyState title={q || status ? t("emptyFiltered") : t("empty")} />
				)}
			</div>

			<Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
		</div>
	);
}
