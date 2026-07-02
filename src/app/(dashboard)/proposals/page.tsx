import { getTranslations } from "next-intl/server";
import { FilterForm } from "@/components/shared/FilterForm";
import { PendingLink } from "@/components/shared/PendingLink";
import {
	Badge,
	EmptyState,
	Input,
	Money,
	PageHeader,
	Pagination,
	Select,
	Table,
	TBody,
	TD,
	TH,
	THead,
	TR,
	toneFor,
} from "@/components/ui";
import { PAGE_SIZE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { formatDate, sanitizeSearch } from "@/lib/utils";

const STATUS_OPTS = [
	"",
	"open",
	"draft",
	"sent",
	"negotiating",
	"approved",
	"lost",
	"expired",
] as const;

export default async function ProposalsPage({
	searchParams,
}: {
	searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
	const { status, page: rawPage, q } = await searchParams;
	const page = Math.max(1, Number(rawPage) || 1);
	const from = (page - 1) * PAGE_SIZE;
	const supabase = await createClient();
	const t = await getTranslations("pages.proposals");
	const tStatus = await getTranslations("status.proposal");

	let query = supabase
		.from("proposals_with_customer")
		.select("id, proposal_number, status, final_price, created_at, customer_name", {
			count: "exact",
		});

	if (status === "open") query = query.in("status", ["draft", "sent", "negotiating"]);
	else if (status) query = query.filter("status", "eq", status);
	if (q) {
		const safe = sanitizeSearch(q);
		query = query.or(`proposal_number.ilike.%${safe}%,customer_name.ilike.%${safe}%`);
	}

	const { data: proposals, count } = await query
		.order("created_at", { ascending: false })
		.range(from, from + PAGE_SIZE - 1);

	return (
		<div className="space-y-5">
			<PageHeader title={t("title")} />

			<search>
				<FilterForm>
					<div className="flex gap-2 flex-wrap">
						<Input
							type="search"
							name="q"
							defaultValue={q}
							placeholder={t("searchPlaceholder")}
							aria-label={t("searchPlaceholder")}
							className="max-w-sm"
						/>
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
					</div>
				</FilterForm>
			</search>

			{/* Desktop table */}
			<div className="hidden md:block">
				<Table>
					<THead>
						<TH>{t("columns.proposalNumber")}</TH>
						<TH>{t("columns.customer")}</TH>
						<TH align="right">{t("columns.price")}</TH>
						<TH>{t("columns.status")}</TH>
						<TH>{t("columns.created")}</TH>
					</THead>
					<TBody>
						{(proposals ?? []).map((p) => {
							const customerName = p.customer_name;
							return (
								<TR key={p.id}>
									<TD className="font-mono text-xs">
										<PendingLink
											href={`/proposals/${p.id}`}
											className="text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
										>
											{p.proposal_number}
										</PendingLink>
									</TD>
									<TD>{customerName ?? "—"}</TD>
									<TD align="right">
										{p.final_price ? (
											<Money value={p.final_price} />
										) : (
											<span className="text-ink-faint">—</span>
										)}
									</TD>
									<TD>
										<Badge tone={toneFor("proposal", p.status)} dot>
											{tStatus(p.status as never)}
										</Badge>
									</TD>
									<TD className="text-ink-faint">{formatDate(p.created_at)}</TD>
								</TR>
							);
						})}
						{(proposals ?? []).length === 0 && (
							<TR>
								<td colSpan={5}>
									<EmptyState title={q || status ? t("emptyFiltered") : t("empty")} />
								</td>
							</TR>
						)}
					</TBody>
				</Table>
			</div>

			{/* Mobile cards */}
			<div className="md:hidden space-y-3">
				{(proposals ?? []).map((p) => {
					const customerName = p.customer_name;
					return (
						<PendingLink
							key={p.id}
							href={`/proposals/${p.id}`}
							className="block bg-surface rounded-xl border border-line p-4 shadow-token active:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
						>
							<div className="flex items-start justify-between mb-2">
								<div>
									<p className="font-mono text-xs text-ink-faint">{p.proposal_number}</p>
									<p className="font-semibold text-ink mt-0.5">{customerName ?? "—"}</p>
								</div>
								<Badge tone={toneFor("proposal", p.status)} dot>
									{tStatus(p.status as never)}
								</Badge>
							</div>
							<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
								<div>
									<p className="text-xs text-ink-faint">{t("columns.price")}</p>
									<p className="font-semibold text-ink tabular-nums">
										{p.final_price ? <Money value={p.final_price} /> : "—"}
									</p>
								</div>
								<div>
									<p className="text-xs text-ink-faint">{t("columns.created")}</p>
									<p className="text-ink-muted">{formatDate(p.created_at)}</p>
								</div>
							</div>
						</PendingLink>
					);
				})}
				{(proposals ?? []).length === 0 && (
					<EmptyState title={q || status ? t("emptyFiltered") : t("empty")} className="py-10" />
				)}
			</div>

			<Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
		</div>
	);
}
