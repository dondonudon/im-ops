"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { PendingLink } from "@/components/shared/PendingLink";
import {
	Badge,
	Button,
	buttonStyles,
	Card,
	Field,
	FormError,
	Input,
	Textarea,
	toneFor,
} from "@/components/ui";
import { syncSurveyToCalendar } from "@/lib/gcal/actions";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatRupiah } from "@/lib/utils";

type Lead = {
	id: string;
	status: string;
	customer_id: string;
	preferred_date: string | null;
};

type Survey = {
	id: string;
	scheduled_at: string;
	conducted_at: string | null;
	gcal_event_id: string | null;
	notes: string | null;
} | null;

type Proposal = {
	id: string;
	proposal_number: string;
	status: string;
	final_price: number | null;
};

/**
 * Status-driven action panel on the Lead detail page.
 * Changes available actions based on lead.status.
 */
export function LeadActionPanel({
	lead,
	survey,
	proposals,
}: {
	lead: Lead;
	survey: Survey;
	proposals: Proposal[];
}) {
	const router = useRouter();
	const t = useTranslations("panels.leadActions");
	const tButtons = useTranslations("common.buttons");
	const [isPending, startTransition] = useTransition();
	const [loading, setLoading] = useState(false);
	const [showSurveyModal, setShowSurveyModal] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// ── Skip → Estimate ───────────────────────────────────────────────
	async function handleSkipToEstimate() {
		setError(null);
		setLoading(true);
		try {
			const supabase = createClient();
			const { data: proposalNumber } = await supabase.rpc("generate_proposal_number", {
				service_type: "DOM",
			});
			const { data: proposal, error: err } = await supabase
				.from("proposals")
				.insert({
					lead_id: lead.id,
					proposal_number: proposalNumber!,
					service_type: "DOM",
					status: "draft",
				})
				.select("id")
				.single();
			if (err) {
				setError(err.message);
				return;
			}
			await supabase.from("leads").update({ status: "estimating" }).eq("id", lead.id);
			router.push(`/estimations/new?proposal_id=${proposal.id}`);
		} finally {
			setLoading(false);
		}
	}

	// ── Mark Survey Done ──────────────────────────────────────────────
	async function handleMarkSurveyDone() {
		setError(null);
		if (!survey) return;
		setLoading(true);
		try {
			const supabase = createClient();
			const [surveyRes, leadRes] = await Promise.all([
				supabase
					.from("surveys")
					.update({ conducted_at: new Date().toISOString() })
					.eq("id", survey.id),
				supabase.from("leads").update({ status: "survey_done" }).eq("id", lead.id),
			]);
			if (surveyRes.error || leadRes.error) {
				setError(surveyRes.error?.message ?? leadRes.error?.message ?? "Error");
				return;
			}
			startTransition(() => router.refresh());
		} finally {
			setLoading(false);
		}
	}

	// ── Create Estimation (after survey) ─────────────────────────────
	async function handleCreateEstimation() {
		setError(null);
		setLoading(true);
		try {
			const supabase = createClient();
			const { data: proposalNumber } = await supabase.rpc("generate_proposal_number", {
				service_type: "DOM",
			});
			const { data: proposal, error: err } = await supabase
				.from("proposals")
				.insert({
					lead_id: lead.id,
					proposal_number: proposalNumber!,
					service_type: "DOM",
					status: "draft",
				})
				.select("id")
				.single();
			if (err) {
				setError(err.message);
				return;
			}
			await supabase.from("leads").update({ status: "estimating" }).eq("id", lead.id);
			router.push(`/estimations/new?proposal_id=${proposal.id}`);
		} finally {
			setLoading(false);
		}
	}

	return (
		<Card className="p-5 space-y-4">
			<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t("title")}</h2>

			{error && <FormError>{error}</FormError>}

			{/* ── STATUS: new ── */}
			{lead.status === "new" && (
				<div className="space-y-2">
					<Button
						type="button"
						onClick={() => setShowSurveyModal(true)}
						variant="secondary"
						size="md"
						className="w-full"
					>
						{t("scheduleSurvey")}
					</Button>
					<Button
						type="button"
						onClick={handleSkipToEstimate}
						loading={loading || isPending}
						variant="primary"
						size="md"
						className="w-full"
					>
						{t("skipToEstimate")}
					</Button>
				</div>
			)}

			{/* ── STATUS: survey_scheduled ── */}
			{lead.status === "survey_scheduled" && survey && (
				<div className="space-y-3">
					<div className="text-sm">
						<p className="text-ink-muted">{t("surveyScheduled")}</p>
						<p className="font-medium mt-0.5 text-ink">{formatDate(survey.scheduled_at)}</p>
					</div>
					<div className="flex gap-2">
						<PendingLink
							href={`/surveys/${survey.id}`}
							className={buttonStyles({
								variant: "secondary",
								size: "md",
								className: "flex-1 justify-center",
							})}
						>
							{t("viewSurvey")}
						</PendingLink>
						<Button
							type="button"
							onClick={() => setShowEditModal(true)}
							variant="secondary"
							size="md"
							className="flex-1"
						>
							{t("editSurvey")}
						</Button>
					</div>
					<Button
						type="button"
						onClick={handleMarkSurveyDone}
						loading={loading || isPending}
						variant="primary"
						size="md"
						className="w-full"
					>
						{t("markDone")}
					</Button>
				</div>
			)}

			{/* ── STATUS: survey_done ── */}
			{lead.status === "survey_done" && (
				<div className="space-y-3">
					<p className="text-sm text-ink-muted">
						{t("surveyCompleted")} {survey?.conducted_at ? formatDate(survey.conducted_at) : ""}
					</p>
					<Button
						type="button"
						onClick={handleCreateEstimation}
						loading={loading || isPending}
						variant="primary"
						size="md"
						className="w-full"
					>
						{t("createEstimation")}
					</Button>
				</div>
			)}

			{/* ── STATUS: estimating ── */}
			{lead.status === "estimating" && proposals.length > 0 && (
				<div className="space-y-2">
					<p className="text-sm text-ink-muted">{t("estimationInProgress")}</p>
					<PendingLink
						href={`/proposals/${proposals[0].id}`}
						className={buttonStyles({
							variant: "primary",
							size: "md",
							className: "w-full justify-center",
						})}
					>
						{t("openProposal")}
					</PendingLink>
				</div>
			)}

			{/* ── STATUS: proposal_sent ── */}
			{lead.status === "proposal_sent" && proposals.length > 0 && (
				<div className="space-y-2">
					{proposals.map((p) => (
						<div key={p.id} className="flex items-center justify-between text-sm">
							<span className="font-mono text-xs text-ink-muted">{p.proposal_number}</span>
							<div className="flex items-center gap-2">
								{p.final_price && (
									<span className="text-xs text-ink">{formatRupiah(p.final_price)}</span>
								)}
								<Badge tone={toneFor("proposal", p.status)} dot>
									{p.status}
								</Badge>
								<PendingLink
									href={`/proposals/${p.id}`}
									className="text-primary-text text-xs hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] rounded"
								>
									{tButtons("view")} →
								</PendingLink>
							</div>
						</div>
					))}
				</div>
			)}

			{/* ── STATUS: converted ── */}
			{lead.status === "converted" && (
				<p className="text-sm text-success font-medium">{t("convertedToJob")}</p>
			)}

			{/* ── STATUS: closed_lost ── */}
			{lead.status === "closed_lost" && (
				<p className="text-sm text-danger font-medium">{t("closedLost")}</p>
			)}

			{/* Schedule survey modal */}
			{showSurveyModal && (
				<SurveyScheduleModal
					leadId={lead.id}
					onClose={() => setShowSurveyModal(false)}
					onDone={() => {
						setShowSurveyModal(false);
						startTransition(() => router.refresh());
					}}
				/>
			)}

			{/* Edit survey modal */}
			{showEditModal && survey && (
				<SurveyEditModal
					survey={survey}
					onClose={() => setShowEditModal(false)}
					onDone={() => {
						setShowEditModal(false);
						startTransition(() => router.refresh());
					}}
				/>
			)}
		</Card>
	);
}

// ── Edit Survey Modal ─────────────────────────────────────────────────────────
function SurveyEditModal({
	survey,
	onClose,
	onDone,
}: {
	survey: { id: string; scheduled_at: string; notes: string | null };
	onClose: () => void;
	onDone: () => void;
}) {
	const tModal = useTranslations("modals.editSurvey");
	const tButtons = useTranslations("common.buttons");
	const [form, setForm] = useState({
		scheduled_at: survey.scheduled_at.slice(0, 16),
		notes: survey.notes ?? "",
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const tErrors = useTranslations("common.errors");

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!form.scheduled_at) {
			setError(tErrors("dateTimeRequired"));
			return;
		}
		setSaving(true);
		setError(null);

		try {
			const supabase = createClient();
			const { error: survErr } = await supabase
				.from("surveys")
				.update({
					scheduled_at: new Date(form.scheduled_at).toISOString(),
					notes: form.notes.trim() || null,
				})
				.eq("id", survey.id);
			if (survErr) throw survErr;

			void syncSurveyToCalendar(survey.id).catch(() => {});

			onDone();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Error");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="edit-survey-modal-title"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
		>
			<Card className="w-full max-w-sm p-6 shadow-token-md space-y-4">
				<h3 id="edit-survey-modal-title" className="text-base font-semibold text-ink">
					{tModal("title")}
				</h3>

				{error && <FormError>{error}</FormError>}

				<form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
					<Field label={tModal("dateTime")} htmlFor="edit_survey_scheduled_at" required>
						<Input
							id="edit_survey_scheduled_at"
							type="datetime-local"
							value={form.scheduled_at}
							onChange={(e) => setForm((p) => ({ ...p, scheduled_at: e.target.value }))}
							required
						/>
					</Field>
					<Field label={tModal("notes")} htmlFor="edit_survey_notes">
						<Textarea
							id="edit_survey_notes"
							rows={2}
							value={form.notes}
							onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
							className="resize-none"
						/>
					</Field>
					<div className="flex gap-2">
						<Button type="submit" loading={saving} variant="primary" size="md" className="flex-1">
							{saving ? tButtons("saving") : tButtons("save")}
						</Button>
						<Button
							type="button"
							onClick={onClose}
							variant="secondary"
							size="md"
							className="flex-1"
						>
							{tButtons("cancel")}
						</Button>
					</div>
				</form>
			</Card>
		</div>
	);
}

// ── Schedule Survey Modal ─────────────────────────────────────────────────────
function SurveyScheduleModal({
	leadId,
	onClose,
	onDone,
}: {
	leadId: string;
	onClose: () => void;
	onDone: () => void;
}) {
	const tModal = useTranslations("modals.scheduleSurvey");
	const tButtons = useTranslations("common.buttons");
	const [form, setForm] = useState({ scheduled_at: "", notes: "" });
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const tErrors = useTranslations("common.errors");

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!form.scheduled_at) {
			setError(tErrors("dateTimeRequired"));
			return;
		}
		setSaving(true);
		setError(null);

		try {
			const supabase = createClient();
			const { data: survey, error: survErr } = await supabase
				.from("surveys")
				.insert({
					lead_id: leadId,
					scheduled_at: new Date(form.scheduled_at).toISOString(),
					notes: form.notes.trim() || null,
				})
				.select("id")
				.single();
			if (survErr) throw survErr;

			await supabase.from("leads").update({ status: "survey_scheduled" }).eq("id", leadId);

			// Best-effort calendar push — failures are surfaced via the retry button.
			if (survey?.id) {
				void syncSurveyToCalendar(survey.id).catch(() => {});
			}

			onDone();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Error");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="survey-modal-title"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
		>
			<Card className="w-full max-w-sm p-6 shadow-token-md space-y-4">
				<h3 id="survey-modal-title" className="text-base font-semibold text-ink">
					{tModal("title")}
				</h3>

				{error && <FormError>{error}</FormError>}

				<form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
					<Field label={tModal("dateTime")} htmlFor="survey_scheduled_at" required>
						<Input
							id="survey_scheduled_at"
							type="datetime-local"
							value={form.scheduled_at}
							onChange={(e) => setForm((p) => ({ ...p, scheduled_at: e.target.value }))}
							required
						/>
					</Field>
					<Field label={tModal("notes")} htmlFor="survey_notes">
						<Textarea
							id="survey_notes"
							rows={2}
							value={form.notes}
							onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
							className="resize-none"
						/>
					</Field>
					<div className="flex gap-2">
						<Button type="submit" loading={saving} variant="primary" size="md" className="flex-1">
							{saving ? tButtons("scheduling") : tButtons("confirm")}
						</Button>
						<Button
							type="button"
							onClick={onClose}
							variant="secondary"
							size="md"
							className="flex-1"
						>
							{tButtons("cancel")}
						</Button>
					</div>
				</form>
			</Card>
		</div>
	);
}
