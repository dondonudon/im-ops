"use client";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

const EVENT_TYPE_VALUES = [
	"loading_start",
	"loading_done",
	"transit_start",
	"transit_done",
	"unloading_start",
	"unloading_done",
	"overtime_approved",
	"overnight_approved",
	"crew_added",
	"custom",
] as const;

// Events that signal the job has physically started — trigger auto-start when job is still scheduled
const OPERATIONAL_EVENTS = new Set([
	"loading_start",
	"loading_done",
	"transit_start",
	"transit_done",
	"unloading_start",
	"unloading_done",
]);

function nowLocalISO(): string {
	const d = new Date();
	const off = d.getTimezoneOffset();
	const local = new Date(d.getTime() - off * 60_000);
	return local.toISOString().slice(0, 16);
}

export function TimelineLogEventButton({ jobId, jobStatus }: { jobId: string; jobStatus: string }) {
	const router = useRouter();
	const tTimeline = useTranslations("panels.timeline");
	const tModal = useTranslations("modals.logEvent");
	const tButtons = useTranslations("common.buttons");
	const tHints = useTranslations("common.hints");
	const tEventType = useTranslations("entity.eventType");
	const tConfirm = useTranslations("modals.confirmations");
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState({
		event_type: EVENT_TYPE_VALUES[0] as string,
		notes: "",
		occurred_at: nowLocalISO(),
	});

	function reset() {
		setForm({
			event_type: EVENT_TYPE_VALUES[0],
			notes: "",
			occurred_at: nowLocalISO(),
		});
		setError(null);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			const supabase = createClient();
			const {
				data: { user },
			} = await supabase.auth.getUser();

			const { error: insertErr } = await supabase.from("job_timeline").insert({
				job_id: jobId,
				event_type: form.event_type,
				notes: form.notes.trim() || null,
				occurred_at: new Date(form.occurred_at).toISOString(),
				logged_by: user?.id ?? null,
			});
			if (insertErr) throw insertErr;

			// Auto-start: if job is still scheduled and the logged event signals physical work has begun
			let effectiveStatus = jobStatus;
			if (jobStatus === "scheduled" && OPERATIONAL_EVENTS.has(form.event_type)) {
				await supabase.from("jobs").update({ status: "in_progress" }).eq("id", jobId);
				await supabase.from("job_timeline").insert({
					job_id: jobId,
					event_type: "job_started",
					logged_by: user?.id ?? null,
				});
				effectiveStatus = "in_progress";
			}

			reset();
			setOpen(false);

			// Nudge to complete the job after unloading is done
			if (form.event_type === "unloading_done" && effectiveStatus === "in_progress") {
				if (window.confirm(tConfirm("markJobDone"))) {
					await supabase.from("jobs").update({ status: "completed" }).eq("id", jobId);
					await supabase.from("job_timeline").insert({
						job_id: jobId,
						event_type: "job_completed",
						logged_by: user?.id ?? null,
					});
				}
			}

			router.refresh();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Insert failed.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<Button type="button" onClick={() => setOpen(true)} variant="secondary" size="sm">
				<Plus size={13} aria-hidden="true" />
				{tTimeline("logEvent")}
			</Button>

			{open && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Log timeline event"
					className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
					onClick={() => !saving && setOpen(false)}
					onKeyDown={(e) => {
						if (e.key === "Escape" && !saving) setOpen(false);
					}}
				>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: modal panel stops backdrop click propagation — not a user-interactive element */}
					<div
						role="presentation"
						className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-surface border border-line p-5 shadow-token-md space-y-4"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<div className="flex items-center justify-between">
							<h3 className="text-base font-semibold text-ink">{tModal("title")}</h3>
							<button
								type="button"
								onClick={() => setOpen(false)}
								disabled={saving}
								className="text-sm text-ink-muted hover:text-ink"
							>
								{tButtons("cancel")}
							</button>
						</div>

						<form onSubmit={handleSubmit} className="space-y-3 text-sm" autoComplete="off">
							<Field label={tModal("event")} htmlFor="timeline-event-type">
								<Select
									id="timeline-event-type"
									value={form.event_type}
									onChange={(e) => setForm({ ...form, event_type: e.target.value })}
									required
								>
									{EVENT_TYPE_VALUES.map((value) => (
										<option key={value} value={value}>
											{tEventType(value)}
										</option>
									))}
								</Select>
							</Field>

							<Field label={tModal("when")} htmlFor="timeline-occurred-at">
								<Input
									id="timeline-occurred-at"
									type="datetime-local"
									value={form.occurred_at}
									onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
									required
								/>
							</Field>

							<Field label={tModal("note")} htmlFor="timeline-notes">
								<textarea
									id="timeline-notes"
									value={form.notes}
									onChange={(e) => setForm({ ...form, notes: e.target.value })}
									rows={2}
									placeholder={tHints("optionalParen").replace(/[()]/g, "")}
									className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
								/>
							</Field>

							{error && <FormError>{error}</FormError>}

							<Button type="submit" loading={saving} variant="primary" size="md" className="w-full">
								{saving && <Loader2 size={14} className="animate-spin" />}
								{saving ? tButtons("saving") : tModal("saveEvent")}
							</Button>
						</form>
					</div>
				</div>
			)}
		</>
	);
}
