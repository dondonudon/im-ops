"use client";
import { XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function JobCancelButton({ jobId }: { jobId: string }) {
	const router = useRouter();
	const tActions = useTranslations("actions");
	const tButtons = useTranslations("common.buttons");
	const tConfirm = useTranslations("modals.confirmations");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleClick() {
		if (!window.confirm(tConfirm("cancelJob"))) return;
		setLoading(true);
		setError(null);
		try {
			const supabase = createClient();
			const { error: err } = await supabase
				.from("jobs")
				.update({ status: "cancelled" })
				.eq("id", jobId);
			if (err) throw err;

			const {
				data: { user },
			} = await supabase.auth.getUser();
			await supabase.from("job_timeline").insert({
				job_id: jobId,
				event_type: "job_cancelled",
				notes: "Job cancelled",
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
				variant="danger"
				size="sm"
				aria-label="Cancel job"
			>
				<XCircle size={13} aria-hidden="true" />
				{loading ? tButtons("saving") : tActions("cancelJob")}
			</Button>
			{error && (
				<p role="alert" className="mt-1 text-xs text-danger">
					{error}
				</p>
			)}
		</div>
	);
}
