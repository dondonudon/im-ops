"use client";
import { CheckCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Button that transitions a job status to "completed" and logs a timeline event.
 * Only rendered when the job is in "in_progress" state.
 */
export function JobMarkDoneButton({ jobId }: { jobId: string }) {
	const router = useRouter();
	const tActions = useTranslations("actions");
	const tButtons = useTranslations("common.buttons");
	const tConfirm = useTranslations("modals.confirmations");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleClick() {
		if (!window.confirm(tConfirm("markJobDone"))) return;
		setLoading(true);
		setError(null);
		try {
			const supabase = createClient();
			const { error: err } = await supabase
				.from("jobs")
				.update({ status: "completed" })
				.eq("id", jobId);
			if (err) throw err;

			const {
				data: { user },
			} = await supabase.auth.getUser();
			await supabase.from("job_timeline").insert({
				job_id: jobId,
				event_type: "job_completed",
				notes: "Job marked as completed",
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
				aria-label="Mark job as completed"
			>
				{loading ? (
					<Loader2 size={13} className="animate-spin" aria-hidden="true" />
				) : (
					<CheckCircle size={13} aria-hidden="true" />
				)}
				{loading ? tButtons("saving") : tActions("markDone")}
			</Button>
			{error && (
				<p role="alert" className="mt-1 text-xs text-danger">
					{error}
				</p>
			)}
		</div>
	);
}
