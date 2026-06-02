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
import { sanitizeSearch } from "@/lib/utils";

const PAGE_SIZE = 25;

export default async function FleetPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; page?: string }>;
}) {
	const { q, page: rawPage } = await searchParams;
	const page = Math.max(1, Number(rawPage) || 1);
	const from = (page - 1) * PAGE_SIZE;
	const supabase = await createClient();
	const t = await getTranslations("pages.fleet");
	const tCommon = await getTranslations("common.labels");

	let query = supabase
		.from("fleet")
		.select("id, name, contact_person, phone, vehicle_types, is_active", { count: "exact" });

	if (q) {
		const safe = sanitizeSearch(q);
		query = query.ilike("name", `%${safe}%`);
	}

	const { data: fleet, count } = await query.order("name").range(from, from + PAGE_SIZE - 1);
	const rows = fleet ?? [];

	return (
		<div className="space-y-5">
			<PageHeader title={t("title")} />

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
						<TH>{t("columns.contact")}</TH>
						<TH>{t("columns.phone")}</TH>
						<TH>{t("columns.vehicles")}</TH>
						<TH>{t("columns.status")}</TH>
					</THead>
					<TBody>
						{rows.map((v) => (
							<TR key={v.id}>
								<TD className="font-medium">
									<Link
										href={`/fleet/${v.id}`}
										className="text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
									>
										{v.name}
									</Link>
								</TD>
								<TD className="text-ink-muted">{v.contact_person ?? "—"}</TD>
								<TD className="text-ink-muted">{v.phone ?? "—"}</TD>
								<TD className="text-ink-muted">
									{(v.vehicle_types as string[] | null)?.join(", ") ?? "—"}
								</TD>
								<TD>
									<Badge tone={v.is_active ? "positive" : "neutral"}>
										{v.is_active ? tCommon("active") : tCommon("inactive")}
									</Badge>
								</TD>
							</TR>
						))}
						{rows.length === 0 && (
							<tr>
								<td colSpan={5}>
									<EmptyState title={t("empty")} />
								</td>
							</tr>
						)}
					</TBody>
				</Table>
			</div>

			{/* Mobile cards */}
			<div className="md:hidden space-y-3">
				{rows.map((v) => (
					<Link
						key={v.id}
						href={`/fleet/${v.id}`}
						className="block rounded-xl border border-line bg-surface shadow-token p-4 transition-colors active:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
					>
						<div className="flex items-start justify-between mb-2">
							<div>
								<p className="font-semibold text-ink">{v.name}</p>
								{v.contact_person && (
									<p className="text-sm text-ink-faint mt-0.5">{v.contact_person}</p>
								)}
							</div>
							<Badge tone={v.is_active ? "positive" : "neutral"}>
								{v.is_active ? tCommon("active") : tCommon("inactive")}
							</Badge>
						</div>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
							<div>
								<p className="text-xs text-ink-faint">{t("columns.phone")}</p>
								<p className="text-ink-muted">{v.phone ?? "—"}</p>
							</div>
							{(v.vehicle_types as string[] | null)?.length ? (
								<div>
									<p className="text-xs text-ink-faint">{t("columns.vehicles")}</p>
									<p className="text-ink-muted">{(v.vehicle_types as string[]).join(", ")}</p>
								</div>
							) : null}
						</div>
					</Link>
				))}
				{rows.length === 0 && <EmptyState title={t("empty")} />}
			</div>

			<Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
		</div>
	);
}
