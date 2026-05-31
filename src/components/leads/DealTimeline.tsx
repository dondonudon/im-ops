import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { Card, CardHeader, Badge, toneFor } from "@/components/ui";
import { formatDate, formatRupiah, cn } from "@/lib/utils";

type Survey = {
	id: string;
	scheduled_at: string;
	conducted_at: string | null;
} | null;
type Proposal = {
	id: string;
	proposal_number: string;
	status: string;
	final_price: number | null;
};
type Job = { id: string; job_number: string; status: string } | null;

/** Lead status → lifecycle stage index, for marking stages reached/skipped. */
const STATUS_IDX: Record<string, number> = {
	new: 0,
	survey_scheduled: 1,
	survey_done: 1,
	estimating: 2,
	proposal_sent: 3,
	converted: 4,
	closed_lost: 0,
};

/**
 * Deal lifecycle timeline — the unifying view that turns the lead page into a
 * full deal hub: intake → survey → estimate & proposal → job, with inline
 * status, price and drill-in links so the whole deal is visible in one place.
 */
export async function DealTimeline({
	status,
	createdAt,
	channel,
	survey,
	proposals,
	job,
}: {
	status: string;
	createdAt: string;
	channel: string | null;
	survey: Survey;
	proposals: Proposal[];
	job: Job;
}) {
	const t = await getTranslations("pages.leadDetail");
	const tChannel = await getTranslations("entity.originChannel");
	const tPropStatus = await getTranslations("status.proposal");
	const tJobStatus = await getTranslations("status.job");
	const idx = STATUS_IDX[status] ?? 0;

	const surveySub = survey?.conducted_at
		? t("surveyCompletedOn", { date: formatDate(survey.conducted_at) })
		: survey
			? t("surveyScheduledOn", { date: formatDate(survey.scheduled_at) })
			: idx >= 2
				? t("surveySkipped")
				: t("surveyOptional");

	return (
		<Card>
			<CardHeader title={t("lifecycle")} />
			<ol className="p-5 pt-4">
				<Stage
					done
					title={t("stageIntake")}
					sub={`${formatDate(createdAt)}${channel ? ` · ${tChannel(channel as never)}` : ""}`}
				/>

				<Stage
					done={Boolean(survey?.conducted_at)}
					current={Boolean(survey && !survey.conducted_at)}
					title={t("stageSurvey")}
					sub={surveySub}
					link={
						survey ? { href: `/surveys/${survey.id}`, label: t("viewSurvey") } : undefined
					}
				/>

				<Stage
					done={proposals.length > 0}
					current={idx === 2 || idx === 3}
					title={t("stageProposal")}
					sub={proposals.length === 0 ? t("noProposalYet") : undefined}
				>
					{proposals.length > 0 && (
						<ul className="mt-1.5 space-y-1.5">
							{proposals.map((p) => (
								<li
									key={p.id}
									className="flex items-center gap-2 flex-wrap text-xs"
								>
									<span className="font-mono font-semibold text-ink">
										{p.proposal_number}
									</span>
									<Badge tone={toneFor("proposal", p.status)} dot>
										{tPropStatus(p.status as never)}
									</Badge>
									{p.final_price != null && (
										<span className="tabular-nums font-medium text-ink">
											{formatRupiah(p.final_price)}
										</span>
									)}
									<Link
										href={`/proposals/${p.id}`}
										className="ml-auto text-primary-text font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
									>
										{t("openProposal")} →
									</Link>
								</li>
							))}
						</ul>
					)}
				</Stage>

				<Stage
					last
					done={Boolean(job)}
					title={t("stageJob")}
					sub={job ? undefined : t("noJobYet")}
				>
					{job && (
						<div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
							<span className="font-mono font-semibold text-ink">
								#{job.job_number}
							</span>
							<Badge tone={toneFor("job", job.status)} dot>
								{tJobStatus(job.status as never)}
							</Badge>
							<Link
								href={`/jobs/${job.id}`}
								className="ml-auto text-primary-text font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
							>
								{t("viewJob")} →
							</Link>
						</div>
					)}
				</Stage>
			</ol>
		</Card>
	);
}

function Stage({
	done = false,
	current = false,
	last = false,
	title,
	sub,
	link,
	children,
}: {
	done?: boolean;
	current?: boolean;
	last?: boolean;
	title: string;
	sub?: string;
	link?: { href: string; label: string };
	children?: React.ReactNode;
}) {
	return (
		<li className="relative flex gap-3 pb-5 last:pb-0">
			{!last && (
				<span
					className="absolute left-[9px] top-5 bottom-0 w-px bg-line"
					aria-hidden="true"
				/>
			)}
			<span
				className={cn(
					"relative z-10 mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 shrink-0",
					done
						? "bg-primary border-primary text-primary-fg"
						: current
							? "border-primary bg-surface"
							: "border-line bg-surface",
				)}
				aria-hidden="true"
			>
				{done && <Check size={11} strokeWidth={3} />}
			</span>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-semibold text-ink">{title}</p>
				{sub && <p className="text-xs text-ink-muted mt-0.5">{sub}</p>}
				{children}
				{link && (
					<Link
						href={link.href}
						className="inline-block mt-1 text-xs font-semibold text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
					>
						{link.label} →
					</Link>
				)}
			</div>
		</li>
	);
}
