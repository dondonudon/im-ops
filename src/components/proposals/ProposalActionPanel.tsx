"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useState, useTransition } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { Button, buttonStyles, Card, Field, FormError, Input, Select } from "@/components/ui";
import { syncJobToCalendar } from "@/lib/gcal/actions";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/utils";

type Proposal = {
	id: string;
	status: string;
	final_price: number | null;
	pdf_url: string | null;
	lead_id: string;
};

type Lead = {
	id: string;
	pickup_address: string | null;
	destination_address: string | null;
	preferred_date: string | null;
} | null;

type Customer = {
	id: string;
	name: string;
	phone: string | null;
} | null;

type Job = { id: string; job_number: string; status: string } | null;

/**
 * Proposal action panel — buttons change based on proposal.status.
 */
export function ProposalActionPanel({
	proposal,
	lead,
	customer,
	hasEstimation,
	job,
}: {
	proposal: Proposal;
	lead: Lead;
	customer: Customer;
	hasEstimation: boolean;
	job: Job;
}) {
	const router = useRouter();
	const t = useTranslations("panels.proposalActions");
	const [isPending, startTransition] = useTransition();
	const [loading, setLoading] = useState(false);
	const [showCounterModal, setShowCounterModal] = useState(false);
	const [showLostModal, setShowLostModal] = useState(false);
	const [showJobModal, setShowJobModal] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// ── Mark as Sent ────────────────────────────────────────────────
	async function handleMarkSent() {
		setError(null);
		setLoading(true);
		try {
			const supabase = createClient();
			const { data: revs } = await supabase
				.from("proposal_revisions")
				.select("version_number")
				.eq("proposal_id", proposal.id)
				.order("version_number", { ascending: false })
				.limit(1);
			const nextVersion = (revs?.[0]?.version_number ?? 0) + 1;
			const [updateRes, revRes] = await Promise.all([
				supabase.from("proposals").update({ status: "sent" }).eq("id", proposal.id),
				supabase.from("proposal_revisions").insert({
					proposal_id: proposal.id,
					version_number: nextVersion,
					price: proposal.final_price ?? 0,
					changed_by: "operator",
					note: "Initial proposal sent",
				}),
			]);
			if (updateRes.error || revRes.error) {
				setError(updateRes.error?.message ?? revRes.error?.message ?? "Error");
				return;
			}
			await supabase.from("leads").update({ status: "proposal_sent" }).eq("id", proposal.lead_id);
			startTransition(() => router.refresh());
		} finally {
			setLoading(false);
		}
	}

	// ── Mark Approved ───────────────────────────────────────────────
	async function handleMarkApproved() {
		setError(null);
		setLoading(true);
		try {
			const supabase = createClient();
			const { data: revs } = await supabase
				.from("proposal_revisions")
				.select("version_number")
				.eq("proposal_id", proposal.id)
				.order("version_number", { ascending: false })
				.limit(1);
			const nextVersion = (revs?.[0]?.version_number ?? 0) + 1;
			await Promise.all([
				supabase
					.from("proposals")
					.update({
						status: "approved",
						approved_at: new Date().toISOString(),
					})
					.eq("id", proposal.id),
				supabase.from("proposal_revisions").insert({
					proposal_id: proposal.id,
					version_number: nextVersion,
					price: proposal.final_price ?? 0,
					changed_by: "operator",
					note: "Approved by customer",
				}),
			]);
			startTransition(() => router.refresh());
		} finally {
			setLoading(false);
		}
	}

	// ── WhatsApp message templates ──────────────────────────────────
	const waMessage = customer?.phone
		? `Halo ${customer.name}, berikut proposal pindahan dari IM Moving:%0A%0ANo. Proposal: ${proposal.id}%0ATotal: Rp ${proposal.final_price?.toLocaleString("id-ID") ?? "?"}%0A%0ASilakan dicek dan konfirmasi. Terima kasih.`
		: "";

	return (
		<Card className="p-5 space-y-4">
			<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t("title")}</h2>

			{error && <FormError>{error}</FormError>}

			{/* ── DRAFT ── */}
			{proposal.status === "draft" && (
				<div className="space-y-2">
					<Link
						href={`/estimations/new?proposal_id=${proposal.id}`}
						className={buttonStyles({ variant: "secondary", size: "md", className: "w-full" })}
					>
						{hasEstimation ? t("editEstimation") : t("createEstimation")}
					</Link>
					{hasEstimation && (
						<Button
							type="button"
							onClick={handleMarkSent}
							disabled={loading || isPending || !proposal.final_price}
							loading={loading || isPending}
							variant="primary"
							size="md"
							className="w-full"
						>
							{t("markAsSent")}
						</Button>
					)}
				</div>
			)}

			{/* ── SENT / NEGOTIATING ── */}
			{(proposal.status === "sent" || proposal.status === "negotiating") && (
				<div className="space-y-2">
					{customer?.phone && (
						<WhatsAppButton
							phone={customer.phone}
							message={waMessage}
							label={t("sendViaWhatsapp")}
							className="w-full justify-center"
						/>
					)}
					<Button
						type="button"
						onClick={() => setShowCounterModal(true)}
						variant="secondary"
						size="md"
						className="w-full"
					>
						{t("recordCounterOffer")}
					</Button>
					<Button
						type="button"
						onClick={handleMarkApproved}
						disabled={loading || isPending}
						loading={loading || isPending}
						variant="primary"
						size="md"
						className="w-full bg-success hover:opacity-90 text-white"
					>
						{t("markApproved")}
					</Button>
					<Button
						type="button"
						onClick={() => setShowLostModal(true)}
						variant="danger"
						size="md"
						className="w-full"
					>
						{t("markLost")}
					</Button>
				</div>
			)}

			{/* ── APPROVED ── */}
			{proposal.status === "approved" && !job && (
				<div className="space-y-2">
					<div className="text-sm text-success font-medium">
						✓ {t("approved")} — {proposal.final_price ? formatRupiah(proposal.final_price) : "—"}
					</div>
					<Button
						type="button"
						onClick={() => setShowJobModal(true)}
						variant="primary"
						size="md"
						className="w-full"
					>
						{t("convertToJob")}
					</Button>
				</div>
			)}

			{/* ── JOB CREATED ── */}
			{job && (
				<div className="space-y-2">
					<p className="text-sm text-ink-muted">{t("jobCreated")}</p>
					<Link
						href={`/jobs/${job.id}`}
						className={buttonStyles({ variant: "primary", size: "md", className: "w-full" })}
					>
						{t("viewJobWith", { number: job.job_number })}
					</Link>
				</div>
			)}

			{/* ── LOST / EXPIRED ── */}
			{(proposal.status === "lost" || proposal.status === "expired") && (
				<p className="text-sm text-ink-muted">{t("noFurtherActions")}</p>
			)}

			{/* Modals */}
			{showCounterModal && (
				<CounterOfferModal
					proposalId={proposal.id}
					currentPrice={proposal.final_price ?? 0}
					onClose={() => setShowCounterModal(false)}
					onDone={() => {
						setShowCounterModal(false);
						startTransition(() => router.refresh());
					}}
				/>
			)}
			{showLostModal && (
				<MarkLostModal
					proposalId={proposal.id}
					leadId={proposal.lead_id}
					onClose={() => setShowLostModal(false)}
					onDone={() => {
						setShowLostModal(false);
						startTransition(() => router.refresh());
					}}
				/>
			)}
			{showJobModal && (
				<ConvertToJobModal
					proposalId={proposal.id}
					leadId={proposal.lead_id}
					preferredDate={lead?.preferred_date ?? null}
					revenue={proposal.final_price ?? 0}
					customerName={customer?.name ?? ""}
					onClose={() => setShowJobModal(false)}
				/>
			)}
		</Card>
	);
}

// ── Counter-offer Modal ───────────────────────────────────────────────────────
function CounterOfferModal({
	proposalId,
	currentPrice,
	onClose,
	onDone,
}: {
	proposalId: string;
	currentPrice: number;
	onClose: () => void;
	onDone: () => void;
}) {
	const tModal = useTranslations("modals.counterOffer");
	const tButtons = useTranslations("common.buttons");
	const tErrors = useTranslations("common.errors");
	const [form, setForm] = useState({ who: "customer", price: "", note: "" });
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!form.price) {
			setError(tErrors("priceRequired"));
			return;
		}
		setSaving(true);
		try {
			const supabase = createClient();
			const { data: revs } = await supabase
				.from("proposal_revisions")
				.select("version_number")
				.eq("proposal_id", proposalId)
				.order("version_number", { ascending: false })
				.limit(1);

			const nextVersion = (revs?.[0]?.version_number ?? 0) + 1;

			await Promise.all([
				supabase.from("proposal_revisions").insert({
					proposal_id: proposalId,
					version_number: nextVersion,
					price: Number(form.price),
					changed_by: form.who,
					note: form.note.trim() || null,
				}),
				supabase
					.from("proposals")
					.update({
						status: "negotiating",
						final_price: Number(form.price),
					})
					.eq("id", proposalId),
			]);
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
			aria-labelledby="counter-title"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
		>
			<Card className="w-full max-w-sm p-6 shadow-token-md space-y-4">
				<h3 id="counter-title" className="text-base font-semibold text-ink">
					{tModal("title")}
				</h3>
				{error && <FormError>{error}</FormError>}
				<form onSubmit={handleSubmit} className="space-y-4">
					<Field label={tModal("proposedBy")} htmlFor="counter-who">
						<Select
							id="counter-who"
							value={form.who}
							onChange={(e) => setForm((p) => ({ ...p, who: e.target.value }))}
						>
							<option value="customer">{tModal("customer")}</option>
							<option value="operator">{tModal("operator")}</option>
						</Select>
					</Field>
					<Field label={tModal("newPrice")} htmlFor="counter-price" required>
						<NumericInput
							value={Number(form.price) || 0}
							onChange={(v) => setForm((p) => ({ ...p, price: v > 0 ? String(v) : "" }))}
							placeholder={new Intl.NumberFormat("id-ID").format(currentPrice)}
							className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
						/>
					</Field>
					<Field label={tModal("note")} htmlFor="counter-note">
						<Input
							id="counter-note"
							type="text"
							value={form.note}
							onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
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

// ── Mark Lost Modal ──────────────────────────────────────────────────────────
function MarkLostModal({
	proposalId,
	leadId,
	onClose,
	onDone,
}: {
	proposalId: string;
	leadId: string;
	onClose: () => void;
	onDone: () => void;
}) {
	const tModal = useTranslations("modals.markLost");
	const tButtons = useTranslations("common.buttons");
	const [reason, setReason] = useState("Price too high");
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);

	// Value strings are stored verbatim in the DB — preserve them. Labels are translated.
	const REASONS: {
		value: string;
		labelKey: "priceTooHigh" | "wentWithCompetitor" | "noResponse" | "other";
	}[] = [
		{ value: "Price too high", labelKey: "priceTooHigh" },
		{ value: "Went with competitor", labelKey: "wentWithCompetitor" },
		{ value: "No response", labelKey: "noResponse" },
		{ value: "Other", labelKey: "other" },
	];

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		const supabase = createClient();
		const fullReason = reason === "Other" ? note : reason;
		await Promise.all([
			supabase
				.from("proposals")
				.update({ status: "lost", closed_reason: fullReason })
				.eq("id", proposalId),
			supabase.from("leads").update({ status: "closed_lost" }).eq("id", leadId),
		]);
		onDone();
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="lost-title"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
		>
			<Card className="w-full max-w-sm p-6 shadow-token-md space-y-4">
				<h3 id="lost-title" className="text-base font-semibold text-ink">
					{tModal("title")}
				</h3>
				<form onSubmit={handleSubmit} className="space-y-4">
					<Field label={tModal("reason")} htmlFor="lost-reason">
						<Select id="lost-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
							{REASONS.map((r) => (
								<option key={r.value} value={r.value}>
									{tModal(`reasons.${r.labelKey}`)}
								</option>
							))}
						</Select>
					</Field>
					{reason === "Other" && (
						<Field label={tModal("note")} htmlFor="lost-note" required>
							<Input
								id="lost-note"
								type="text"
								required
								value={note}
								onChange={(e) => setNote(e.target.value)}
							/>
						</Field>
					)}
					<div className="flex gap-2">
						<Button type="submit" loading={saving} variant="danger" size="md" className="flex-1">
							{saving ? tButtons("saving") : tModal("confirm")}
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

// ── Convert to Job Modal ──────────────────────────────────────────────────────
function ConvertToJobModal({
	proposalId,
	leadId,
	preferredDate,
	revenue,
	customerName,
	onClose,
}: {
	proposalId: string;
	leadId: string;
	preferredDate: string | null;
	revenue: number;
	customerName: string;
	onClose: () => void;
}) {
	const router = useRouter();
	const tModal = useTranslations("modals.convertToJob");
	const tButtons = useTranslations("common.buttons");
	const tErrors = useTranslations("common.errors");
	const tHints = useTranslations("common.hints");
	const [moveDate, setMoveDate] = useState(preferredDate ?? "");
	const [moveTime, setMoveTime] = useState("");
	const [moveEndDate, setMoveEndDate] = useState("");
	const [moveEndTime, setMoveEndTime] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleConfirm(e: React.FormEvent) {
		e.preventDefault();
		if (!moveDate) {
			setError(tErrors("moveDateRequired"));
			return;
		}
		setSaving(true);
		try {
			const supabase = createClient();

			// Generate job number atomically via DB function to avoid race conditions.
			const { data: jobNumber, error: numErr } = await supabase.rpc("generate_job_number");
			if (numErr || !jobNumber) throw numErr ?? new Error("Failed to generate job number");

			const { data: newJob, error: jobErr } = await supabase
				.from("jobs")
				.insert({
					proposal_id: proposalId,
					job_number: jobNumber,
					status: "scheduled",
					move_date: moveDate,
					move_time: moveTime || null,
					move_end_date: moveEndDate || null,
					move_end_time: moveEndTime || null,
					revenue: revenue,
				})
				.select("id")
				.single();

			if (jobErr) throw jobErr;

			await supabase.from("leads").update({ status: "converted" }).eq("id", leadId);

			// Best-effort calendar push — never block job creation on it.
			if (newJob?.id) {
				void syncJobToCalendar(newJob.id).catch(() => {});
			}

			router.push(`/jobs/${newJob.id}`);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Error");
			setSaving(false);
		}
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="job-title"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
		>
			<Card className="w-full max-w-sm p-6 shadow-token-md space-y-4">
				<h3 id="job-title" className="text-base font-semibold text-ink">
					{tModal("title", { name: customerName })}
				</h3>
				{error && <FormError>{error}</FormError>}
				<form onSubmit={handleConfirm} className="space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<Field label={tModal("startDate")} htmlFor="job-start-date" required>
							<Input
								id="job-start-date"
								type="date"
								required
								value={moveDate}
								onChange={(e) => setMoveDate(e.target.value)}
							/>
						</Field>
						<Field label={tModal("startTime")} htmlFor="job-start-time">
							<Input
								id="job-start-time"
								type="time"
								value={moveTime}
								onChange={(e) => setMoveTime(e.target.value)}
							/>
						</Field>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<Field
							label={
								<>
									{tModal("endDate")}{" "}
									<span className="text-ink-faint font-normal">{tModal("endDateHint")}</span>
								</>
							}
							htmlFor="job-end-date"
						>
							<Input
								id="job-end-date"
								type="date"
								min={moveDate || undefined}
								value={moveEndDate}
								onChange={(e) => setMoveEndDate(e.target.value)}
							/>
						</Field>
						<Field
							label={
								<>
									{tModal("endTime")}{" "}
									<span className="text-ink-faint font-normal">{tHints("optionalParen")}</span>
								</>
							}
							htmlFor="job-end-time"
						>
							<Input
								id="job-end-time"
								type="time"
								value={moveEndTime}
								onChange={(e) => setMoveEndTime(e.target.value)}
							/>
						</Field>
					</div>
					<p className="text-sm text-ink-muted">
						{tModal("revenueLockedAt", { amount: formatRupiah(revenue) })}
					</p>
					<div className="flex gap-2">
						<Button type="submit" loading={saving} variant="primary" size="md" className="flex-1">
							{saving ? tModal("creating") : tModal("createJob")}
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
