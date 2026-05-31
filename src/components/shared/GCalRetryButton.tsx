"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
import {
	syncJobToCalendar,
	syncSurveyToCalendar,
} from "@/lib/gcal/actions";
import { Button } from "@/components/ui";

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

	return (
		<div className="flex flex-col gap-1">
			<Button
				type="button"
				onClick={handleClick}
				disabled={loading}
				variant={hasEvent ? "secondary" : "subtle"}
				size="sm"
				aria-label={hasEvent ? "Re-sync to Google Calendar" : "Sync to Google Calendar"}
			>
				{loading ? (
					<Loader2 size={13} className="animate-spin" aria-hidden="true" />
				) : (
					<CalendarPlus size={13} aria-hidden="true" />
				)}
				{label}
			</Button>
			{error && (
				<p role="alert" className="text-xs text-danger">
					{error}
				</p>
			)}
		</div>
	);
}
