"use client";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import {
	Button,
	buttonStyles,
	Card,
	Field,
	FormError,
	Input,
	Select,
	Textarea,
} from "@/components/ui";
import { syncJobToCalendar } from "@/lib/gcal/actions";
import { createClient } from "@/lib/supabase/client";

const JOB_STATUSES = ["scheduled", "in_progress", "completed", "closed", "cancelled"] as const;

type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Job edit form — loads existing job and allows editing status, date, revenue, and notes.
 * Proposal and customer are shown read-only; they are set at job creation.
 */
export default function EditJobPage({ params }: { params: { id: string } }) {
	const { id } = params;
	const router = useRouter();
	const t = useTranslations("forms.job");
	const tButtons = useTranslations("common.buttons");
	const tHints = useTranslations("common.hints");
	const tStatus = useTranslations("status.job");
	const tCustomer = useTranslations("forms.lead");

	const [form, setForm] = useState({
		status: "scheduled" as JobStatus,
		move_date: "",
		move_time: "",
		move_end_date: "",
		move_end_time: "",
		revenue: "",
		notes: "",
		pickup_address: "",
		destination_address: "",
		destination_address_2: "",
	});
	const [jobNumber, setJobNumber] = useState("");
	const [customerName, setCustomerName] = useState("");
	const [leadId, setLeadId] = useState<string | null>(null);
	const [showDestination2, setShowDestination2] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const supabase = createClient();
		supabase
			.from("jobs")
			.select(
				"job_number, status, move_date, move_time, move_end_date, move_end_time, revenue, notes, proposals(leads(id, pickup_address, destination_address, destination_address_2, customers(name)))",
			)
			.eq("id", id)
			.single()
			.then(({ data, error: err }) => {
				if (err || !data) {
					setError("Job not found.");
					setLoading(false);
					return;
				}
				const lead = (
					data.proposals as {
						leads: {
							id: string;
							pickup_address: string | null;
							destination_address: string | null;
							destination_address_2: string | null;
							customers: { name: string } | null;
						} | null;
					} | null
				)?.leads;
				setJobNumber(data.job_number ?? "");
				setCustomerName(lead?.customers?.name ?? "");
				setLeadId(lead?.id ?? null);
				const dest2 = lead?.destination_address_2 ?? "";
				if (dest2) setShowDestination2(true);
				setForm({
					status: (data.status ?? "scheduled") as JobStatus,
					move_date: data.move_date ?? "",
					move_time: ((data as { move_time?: string | null }).move_time ?? "").slice(0, 5),
					move_end_date: (data as { move_end_date?: string | null }).move_end_date ?? "",
					move_end_time: ((data as { move_end_time?: string | null }).move_end_time ?? "").slice(
						0,
						5,
					),
					revenue: data.revenue != null ? String(data.revenue) : "",
					notes: data.notes ?? "",
					pickup_address: lead?.pickup_address ?? "",
					destination_address: lead?.destination_address ?? "",
					destination_address_2: dest2,
				});
				setLoading(false);
			});
	}, [id]);

	function handleChange(
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
	) {
		setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSaving(true);
		try {
			const revenueNum = form.revenue ? Number(form.revenue) : null;
			if (form.revenue && (Number.isNaN(revenueNum) || revenueNum! < 0)) {
				throw new Error("Revenue must be a valid positive number.");
			}
			const supabase = createClient();
			const [{ error: err }, { error: leadErr }] = await Promise.all([
				supabase
					.from("jobs")
					.update({
						status: form.status,
						move_date: form.move_date || undefined,
						move_time: form.move_time || null,
						move_end_date: form.move_end_date || null,
						move_end_time: form.move_end_time || null,
						revenue: revenueNum ?? 0,
						notes: form.notes.trim() || null,
					})
					.eq("id", id),
				leadId
					? supabase
							.from("leads")
							.update({
								pickup_address: form.pickup_address.trim() || null,
								destination_address: form.destination_address.trim() || null,
								destination_address_2: form.destination_address_2.trim() || null,
							})
							.eq("id", leadId)
					: Promise.resolve({ error: null }),
			]);
			if (err) throw err;
			if (leadErr) throw leadErr;

			// Re-sync the Google Calendar event (PATCH if it exists, POST otherwise).
			// Non-blocking — calendar failures must never block the save flow.
			void syncJobToCalendar(id).catch(() => {});

			router.push(`/jobs/${id}`);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Save failed.");
		} finally {
			setSaving(false);
		}
	}

	const STATUS_LABELS: Record<JobStatus, string> = {
		scheduled: tStatus("scheduled"),
		in_progress: tStatus("in_progress"),
		completed: tStatus("completed"),
		closed: tStatus("closed"),
		cancelled: tStatus("cancelled"),
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-40 text-ink-faint">
				<Loader2 size={20} className="animate-spin" aria-hidden="true" />
			</div>
		);
	}

	return (
		<div className="max-w-lg mx-auto space-y-5">
			<Link
				href={`/jobs/${id}`}
				className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
			>
				<ArrowLeft size={15} aria-hidden="true" />
				{t("backToJob")}
			</Link>

			<Card className="p-6">
				<div className="mb-5">
					<p className="text-xs font-mono text-ink-faint mb-0.5">{jobNumber}</p>
					<h1 className="text-xl font-bold text-ink">{t("editTitle")}</h1>
					{customerName && (
						<p className="text-sm text-ink-muted mt-0.5">
							{tCustomer("customer")}: <span className="font-medium text-ink">{customerName}</span>
						</p>
					)}
				</div>

				{error && <FormError>{error}</FormError>}

				<form onSubmit={handleSubmit} className="space-y-4 mt-4" noValidate autoComplete="off">
					{/* Status */}
					<Field label={t("status")} htmlFor="status">
						<Select id="status" name="status" value={form.status} onChange={handleChange}>
							{JOB_STATUSES.map((s) => (
								<option key={s} value={s}>
									{STATUS_LABELS[s]}
								</option>
							))}
						</Select>
					</Field>

					{/* Move date + time */}
					<fieldset className="space-y-3">
						<legend className="block text-sm font-medium text-ink mb-1">{t("schedule")}</legend>
						<div className="grid grid-cols-2 gap-3">
							<Field
								label={
									<>
										{t("startDate")}{" "}
										<span aria-hidden="true" className="text-danger">
											*
										</span>
									</>
								}
								htmlFor="move_date"
							>
								<Input
									id="move_date"
									name="move_date"
									type="date"
									value={form.move_date}
									onChange={handleChange}
									required
								/>
							</Field>
							<Field
								label={
									<>
										{t("startTime")}{" "}
										<span className="text-ink-faint font-normal">{tHints("optionalParen")}</span>
									</>
								}
								htmlFor="move_time"
							>
								<Input
									id="move_time"
									name="move_time"
									type="time"
									value={form.move_time}
									onChange={handleChange}
								/>
							</Field>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<Field
								label={
									<>
										{t("endDate")}{" "}
										<span className="text-ink-faint font-normal">{t("endDateHint")}</span>
									</>
								}
								htmlFor="move_end_date"
							>
								<Input
									id="move_end_date"
									name="move_end_date"
									type="date"
									min={form.move_date || undefined}
									value={form.move_end_date}
									onChange={handleChange}
								/>
							</Field>
							<Field
								label={
									<>
										{t("endTime")}{" "}
										<span className="text-ink-faint font-normal">{tHints("optionalParen")}</span>
									</>
								}
								htmlFor="move_end_time"
							>
								<Input
									id="move_end_time"
									name="move_end_time"
									type="time"
									value={form.move_end_time}
									onChange={handleChange}
								/>
							</Field>
						</div>
					</fieldset>

					{/* Addresses */}
					<fieldset className="space-y-3">
						<legend className="block text-sm font-medium text-ink mb-1">{t("addresses")}</legend>
						<Field label={tCustomer("pickup")} htmlFor="pickup_address">
							<Input
								id="pickup_address"
								name="pickup_address"
								value={form.pickup_address}
								onChange={(e) => {
									e.target.value = e.target.value.toUpperCase();
									handleChange(e);
								}}
								placeholder="—"
								className="uppercase"
							/>
						</Field>
						<Field label={tCustomer("destination")} htmlFor="destination_address">
							<Input
								id="destination_address"
								name="destination_address"
								value={form.destination_address}
								onChange={(e) => {
									e.target.value = e.target.value.toUpperCase();
									handleChange(e);
								}}
								placeholder="—"
								className="uppercase"
							/>
						</Field>

						{showDestination2 ? (
							<Field label={tCustomer("destination2")} htmlFor="destination_address_2">
								<Input
									id="destination_address_2"
									name="destination_address_2"
									value={form.destination_address_2}
									onChange={(e) => {
										e.target.value = e.target.value.toUpperCase();
										handleChange(e);
									}}
									placeholder="—"
									className="uppercase"
								/>
								<button
									type="button"
									onClick={() => {
										setShowDestination2(false);
										setForm((prev) => ({ ...prev, destination_address_2: "" }));
									}}
									className="mt-1 text-xs text-ink-faint hover:text-danger transition-colors"
								>
									{tCustomer("removeDestination2")}
								</button>
							</Field>
						) : (
							<button
								type="button"
								onClick={() => setShowDestination2(true)}
								className="text-sm text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
							>
								+ {tCustomer("addDestination2")}
							</button>
						)}
					</fieldset>

					{/* Revenue */}
					<Field label={t("revenue")} htmlFor="revenue">
						<NumericInput
							id="revenue"
							value={Number(form.revenue) || 0}
							onChange={(v) => setForm((p) => ({ ...p, revenue: v > 0 ? String(v) : "" }))}
							className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
						/>
					</Field>

					{/* Notes */}
					<Field label={t("notes")} htmlFor="notes">
						<Textarea
							id="notes"
							name="notes"
							rows={4}
							value={form.notes}
							onChange={handleChange}
							className="resize-none"
						/>
					</Field>

					{/* Actions */}
					<div className="flex items-center gap-3 pt-2">
						<Button type="submit" loading={saving} variant="primary" size="lg" className="flex-1">
							{saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
							{saving ? tButtons("saving") : tButtons("saveChanges")}
						</Button>
						<Link
							href={`/jobs/${id}`}
							className={buttonStyles({ variant: "secondary", size: "lg" })}
						>
							{tButtons("cancel")}
						</Link>
					</div>
				</form>
			</Card>
		</div>
	);
}
