import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	Badge,
	EmptyState,
	Input,
	PageHeader,
	Pagination,
	Table,
	TBody,
	TD,
	TH,
	THead,
	TR,
} from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, sanitizeSearch } from "@/lib/utils";

const PAGE_SIZE = 25;

/**
 * Customer list page — desktop table + mobile card list, both on the UI kit.
 */
export default async function CustomersPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; page?: string }>;
}) {
	const { q, page: rawPage } = await searchParams;
	const page = Math.max(1, Number(rawPage) || 1);
	const from = (page - 1) * PAGE_SIZE;
	const supabase = await createClient();
	const t = await getTranslations("pages.customers");
	const tType = await getTranslations("entity.customerType");

	let query = supabase
		.from("customers")
		.select("id, name, phone, email, type, company_name, created_at", { count: "exact" });

	if (q) {
		const safe = sanitizeSearch(q);
		query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
	}

	const { data: customers, count } = await query
		.order("created_at", { ascending: false })
		.range(from, from + PAGE_SIZE - 1);
	const rows = customers ?? [];

	return (
		<div className="space-y-5">
			<PageHeader title={t("title")} />

			{/* Search */}
			<form method="GET" role="search">
				<Input
					type="search"
					name="q"
					defaultValue={q}
					placeholder={t("searchPlaceholder")}
					aria-label={t("searchPlaceholder")}
					className="max-w-sm"
				/>
			</form>

			{/* Desktop table */}
			<div className="hidden md:block">
				<Table>
					<THead>
						<TH>{t("columns.name")}</TH>
						<TH>{t("columns.phone")}</TH>
						<TH>{t("columns.type")}</TH>
						<TH>{t("columns.since")}</TH>
					</THead>
					<TBody>
						{rows.map((c) => (
							<TR key={c.id}>
								<TD className="font-medium">
									<Link
										href={`/customers/${c.id}`}
										className="text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
									>
										{c.name}
									</Link>
									{c.company_name && (
										<span className="ml-1 text-xs text-ink-faint">({c.company_name})</span>
									)}
								</TD>
								<TD className="text-ink-muted">{c.phone ?? "—"}</TD>
								<TD>
									<Badge tone={c.type === "corporate" ? "info" : "neutral"}>
										{tType(c.type as never)}
									</Badge>
								</TD>
								<TD className="text-ink-faint tabular-nums">{formatDate(c.created_at)}</TD>
							</TR>
						))}
						{rows.length === 0 && (
							<tr>
								<td colSpan={4}>
									<EmptyState title={q ? t("emptyFiltered") : t("empty")} />
								</td>
							</tr>
						)}
					</TBody>
				</Table>
			</div>

			{/* Mobile cards */}
			<div className="md:hidden space-y-3">
				{rows.map((c) => (
					<Link
						key={c.id}
						href={`/customers/${c.id}`}
						className="block rounded-xl border border-line bg-surface shadow-token p-4 transition-colors active:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="font-semibold text-ink truncate">{c.name}</p>
								{c.company_name && (
									<p className="text-xs text-ink-faint mt-0.5 truncate">{c.company_name}</p>
								)}
							</div>
							<Badge tone={c.type === "corporate" ? "info" : "neutral"}>
								{tType(c.type as never)}
							</Badge>
						</div>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
							<div>
								<p className="text-xs text-ink-faint">{t("columns.phone")}</p>
								<p className="text-ink-muted">{c.phone ?? "—"}</p>
							</div>
							<div>
								<p className="text-xs text-ink-faint">{t("columns.since")}</p>
								<p className="text-ink-muted tabular-nums">{formatDate(c.created_at)}</p>
							</div>
						</div>
					</Link>
				))}
				{rows.length === 0 && <EmptyState title={q ? t("emptyFiltered") : t("empty")} />}
			</div>

			<Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
		</div>
	);
}
