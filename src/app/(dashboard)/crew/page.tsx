import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@/lib/utils";
import {
	PageHeader,
	Input,
	Badge,
	EmptyState,
	Table,
	THead,
	TH,
	TBody,
	TR,
	TD,
	Pagination,
} from "@/components/ui";

const PAGE_SIZE = 25;

export default async function CrewPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; page?: string }>;
}) {
	const { q, page: rawPage } = await searchParams;
	const page = Math.max(1, Number(rawPage) || 1);
	const from = (page - 1) * PAGE_SIZE;
	const supabase = await createClient();
	const t = await getTranslations("pages.crew");
	const tAvail = await getTranslations("entity.availability");

	let query = supabase
		.from("crew")
		.select("id, name, phone, skills, daily_rate, availability_status, is_active", { count: "exact" });

	if (q) query = query.ilike("name", `%${q}%`);

	const { data: crew, count } = await query
		.order("name")
		.range(from, from + PAGE_SIZE - 1);
	const rows = crew ?? [];

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
						<TH>{t("columns.phone")}</TH>
						<TH>{t("columns.dailyRate")}</TH>
						<TH>{t("columns.availability")}</TH>
					</THead>
					<TBody>
						{rows.map((c) => (
							<TR key={c.id}>
								<TD className="font-medium">
									<Link
										href={`/crew/${c.id}`}
										className="text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
									>
										{c.name}
									</Link>
								</TD>
								<TD className="text-ink-muted">{c.phone ?? "—"}</TD>
								<TD className="tabular-nums text-ink-muted">
									{c.daily_rate ? formatRupiah(c.daily_rate) : "—"}
								</TD>
								<TD>
									<Badge tone={availTone(c.availability_status)}>
										{tAvail((c.availability_status ?? "available") as never)}
									</Badge>
								</TD>
							</TR>
						))}
						{rows.length === 0 && (
							<tr>
								<td colSpan={4}>
									<EmptyState title={t("empty")} />
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
						href={`/crew/${c.id}`}
						className="block rounded-xl border border-line bg-surface shadow-token p-4 transition-colors active:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
					>
						<div className="flex items-start justify-between mb-2">
							<div>
								<p className="font-semibold text-ink">{c.name}</p>
								<p className="text-sm text-ink-faint mt-0.5">{c.phone ?? "—"}</p>
							</div>
							<Badge tone={availTone(c.availability_status)}>
								{tAvail((c.availability_status ?? "available") as never)}
							</Badge>
						</div>
						{c.daily_rate && (
							<div className="mt-2">
								<p className="text-xs text-ink-faint">{t("columns.dailyRate")}</p>
								<p className="font-semibold text-ink tabular-nums text-sm">
									{formatRupiah(c.daily_rate)}
								</p>
							</div>
						)}
					</Link>
				))}
				{rows.length === 0 && (
					<EmptyState title={t("empty")} />
				)}
			</div>

			<Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
		</div>
	);
}

function availTone(status: string | null): "positive" | "pending" | "danger" | "neutral" {
	if (status === "available") return "positive";
	if (status === "on_job") return "pending";
	if (status === "unavailable") return "danger";
	return "neutral";
}
