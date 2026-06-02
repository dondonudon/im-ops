"use client";
import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Transitions a job from "scheduled" to "in_progress".
 * Logs a `job_started` event on the timeline at the same time.
 */
export function JobStartButton({ jobId }: { jobId: string }) {
	const router = useRouter();
	const tActions = useTranslations("actions");
	const tConfirm = useTranslations("modals.confirmations");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleClick() {
		if (!window.confirm(tConfirm("startJob"))) return;
		setLoading(true);
		setError(null);
		try {
			const supabase = createClient();
			const { error: updateErr } = await supabase
				.from("jobs")
				.update({ status: "in_progress" })
				.eq("id", jobId);
			if (updateErr) throw updateErr;

			const {
				data: { user },
			} = await supabase.auth.getUser();
			await supabase.from("job_timeline").insert({
				job_id: jobId,
				event_type: "job_started",
				notes: "Job marked as in progress",
				logged_by: user?.id ?? null,
			});

			router.refresh();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Update failed.");
			setLoading(false);
		}
	}

	return (
		<div>
			<Button
				type="button"
				onClick={handleClick}
				loading={loading}
				variant="primary"
				size="sm"
				aria-label="Start job"
			>
				{loading ? (
					<Loader2 size={13} className="animate-spin" aria-hidden="true" />
				) : (
					<Play size={13} aria-hidden="true" />
				)}
				{loading ? tActions("starting") : tActions("startJob")}
			</Button>
			{error && (
				<p role="alert" className="mt-1 text-xs text-danger">
					{error}
				</p>
			)}
		</div>
	);
}
