"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
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

function nowLocalISO(): string {
	const d = new Date();
	const off = d.getTimezoneOffset();
	const local = new Date(d.getTime() - off * 60_000);
	return local.toISOString().slice(0, 16);
}

/**
 * "+ Log Event" button that opens a modal to insert a job_timeline row.
 * Used on the job detail page and the dedicated timeline route.
 */
export function TimelineLogEventButton({ jobId }: { jobId: string }) {
	const router = useRouter();
	const tTimeline = useTranslations("panels.timeline");
	const tModal = useTranslations("modals.logEvent");
	const tButtons = useTranslations("common.buttons");
	const tHints = useTranslations("common.hints");
	const tEventType = useTranslations("entity.eventType");
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
			const { error: insertErr } = await supabase
				.from("job_timeline")
				.insert({
					job_id: jobId,
					event_type: form.event_type,
					notes: form.notes.trim() || null,
					occurred_at: new Date(form.occurred_at).toISOString(),
					logged_by: user?.id ?? null,
				});
			if (insertErr) throw insertErr;
			reset();
			setOpen(false);
			router.refresh();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Insert failed.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
			>
				<Plus size={13} aria-hidden="true" />
				{tTimeline("logEvent")}
			</button>

			{open && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Log timeline event"
					className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
					onClick={() => !saving && setOpen(false)}
				>
					<div
						className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-900 p-5 space-y-4"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center justify-between">
							<h3 className="text-base font-semibold">{tModal("title")}</h3>
							<button
								type="button"
								onClick={() => setOpen(false)}
								disabled={saving}
								className="text-sm text-gray-500 hover:text-gray-700"
							>
								{tButtons("cancel")}
							</button>
						</div>

						<form onSubmit={handleSubmit} className="space-y-3 text-sm">
							<div>
								<label className="block text-xs text-gray-500 mb-1">
									{tModal("event")}
								</label>
								<select
									value={form.event_type}
									onChange={(e) =>
										setForm({ ...form, event_type: e.target.value })
									}
									className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
									required
								>
									{EVENT_TYPE_VALUES.map((value) => (
										<option key={value} value={value}>
											{tEventType(value)}
										</option>
									))}
								</select>
							</div>

							<div>
								<label className="block text-xs text-gray-500 mb-1">
									{tModal("when")}
								</label>
								<input
									type="datetime-local"
									value={form.occurred_at}
									onChange={(e) =>
										setForm({ ...form, occurred_at: e.target.value })
									}
									className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
									required
								/>
							</div>

							<div>
								<label className="block text-xs text-gray-500 mb-1">
									{tModal("note")}
								</label>
								<textarea
									value={form.notes}
									onChange={(e) => setForm({ ...form, notes: e.target.value })}
									rows={2}
									placeholder={tHints("optionalParen").replace(/[()]/g, "")}
									className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
								/>
							</div>

							{error && (
								<p role="alert" className="text-xs text-red-600">
									{error}
								</p>
							)}

							<button
								type="submit"
								disabled={saving}
								className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
							>
								{saving && <Loader2 size={14} className="animate-spin" />}
								{saving ? tButtons("saving") : tModal("saveEvent")}
							</button>
						</form>
					</div>
				</div>
			)}
		</>
	);
}
