"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarSync, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { syncAllToCalendar } from "@/lib/gcal/actions";

/**
 * Bulk-syncs every future job + scheduled survey to Google Calendar.
 * Useful after manually deleting events in GCal (re-creates them) or
 * after env/calendar id changes.
 */
export function SyncAllButton() {
	const router = useRouter();
	const tActions = useTranslations("common.actions");
	const tConfirm = useTranslations("modals.confirmations");
	const tSyncAll = useTranslations("syncAll");
	const [, startTransition] = useTransition();
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<string | null>(null);

	async function handleClick() {
		if (!window.confirm(tConfirm("syncAll"))) return;
		setLoading(true);
		setResult(null);
		try {
			const r = await syncAllToCalendar();
			const jobTotal = r.jobs.ok + r.jobs.failed;
			const surveyTotal = r.surveys.ok + r.surveys.failed;
			if (jobTotal === 0 && surveyTotal === 0) {
				setResult(tSyncAll("nothing", { date: r.cutoffISO }));
			} else {
				const parts: string[] = [];
				if (jobTotal > 0)
					parts.push(
						tSyncAll("jobsLabel", { ok: r.jobs.ok, total: jobTotal }),
					);
				if (surveyTotal > 0)
					parts.push(
						tSyncAll("surveysLabel", {
							ok: r.surveys.ok,
							total: surveyTotal,
						}),
					);
				const failed = r.jobs.failed + r.surveys.failed;
				setResult(
					`${parts.join(" · ")}${failed > 0 ? ` · ${tSyncAll("failedSuffix", { count: failed })}` : ""}`,
				);
			}
			startTransition(() => router.refresh());
		} catch (err: unknown) {
			setResult(err instanceof Error ? err.message : "Sync failed.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex items-center gap-3">
			<button
				type="button"
				onClick={handleClick}
				disabled={loading}
				className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
			>
				{loading ? (
					<Loader2 size={13} className="animate-spin" aria-hidden="true" />
				) : (
					<CalendarSync size={13} aria-hidden="true" />
				)}
				{loading ? tActions("syncing") : tActions("syncAll")}
			</button>
			{result && (
				<span
					role="status"
					className="text-xs text-slate-500 max-w-[260px] truncate"
					title={result}
				>
					{result}
				</span>
			)}
		</div>
	);
}
