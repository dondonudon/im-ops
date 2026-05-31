"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
import {
	syncJobToCalendar,
	syncSurveyToCalendar,
} from "@/lib/gcal/actions";

/**
 * Push or re-push this survey/job to Google Calendar.
 *
 * Always rendered — calendar sync is best-effort and we want a manual handle
 * available even after a successful initial sync, so operators can:
 *   - re-sync after editing the date/time
 *   - recover from a manual delete in Google Calendar (PATCH 404 → fresh POST)
 *
 * Style differs slightly based on whether an event is already linked.
 */
export function GCalRetryButton({
	kind,
	id,
	hasEvent = false,
}: {
	kind: "survey" | "job";
	id: string;
	hasEvent?: boolean;
}) {
	const router = useRouter();
	const [, startTransition] = useTransition();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	async function handleClick() {
		setLoading(true);
		setError(null);
		setDone(false);
		try {
			const result = await (kind === "survey"
				? syncSurveyToCalendar(id)
				: syncJobToCalendar(id));
			if (!result.ok) {
				setError(result.error);
				return;
			}
			setDone(true);
			startTransition(() => router.refresh());
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Sync failed.");
		} finally {
			setLoading(false);
		}
	}

	const label = loading
		? "Syncing…"
		: done
			? "Synced"
			: hasEvent
				? "Re-sync to Calendar"
				: "Sync to Calendar";

	const buttonClass = hasEvent
		? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
		: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 focus-visible:ring-amber-500";

	return (
		<div className="flex flex-col gap-1">
			<button
				type="button"
				onClick={handleClick}
				disabled={loading}
				className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors ${buttonClass}`}
				aria-label={hasEvent ? "Re-sync to Google Calendar" : "Sync to Google Calendar"}
			>
				{loading ? (
					<Loader2 size={13} className="animate-spin" aria-hidden="true" />
				) : (
					<CalendarPlus size={13} aria-hidden="true" />
				)}
				{label}
			</button>
			{error && (
				<p role="alert" className="text-xs text-red-600">
					{error}
				</p>
			)}
		</div>
	);
}
