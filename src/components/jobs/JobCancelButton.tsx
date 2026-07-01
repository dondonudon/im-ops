"use client";
import { AlertTriangle, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/utils";

type Payment = { amount: number; payment_type: string };

export function JobCancelButton({ jobId, payments = [] }: { jobId: string; payments?: Payment[] }) {
	const router = useRouter();
	const t = useTranslations("modals.cancelJob");
	const tActions = useTranslations("actions");
	const tButtons = useTranslations("common.buttons");
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const totalPaid = payments
		.filter((p) => p.payment_type !== "refund")
		.reduce((sum, p) => sum + p.amount, 0);
	const hasPaid = totalPaid > 0;

	async function handleConfirm() {
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
		<>
			<Button
				type="button"
				onClick={() => setOpen(true)}
				variant="danger"
				size="sm"
				aria-label="Cancel job"
			>
				<XCircle size={13} aria-hidden="true" />
				{tActions("cancelJob")}
			</Button>

			{open && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label={t("title")}
					className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
					onClick={() => !loading && setOpen(false)}
					onKeyDown={(e) => {
						if (e.key === "Escape" && !loading) setOpen(false);
					}}
				>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: modal panel stops backdrop propagation */}
					<div
						role="presentation"
						className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-surface border border-line p-5 shadow-token-md space-y-4"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<h3 className="text-base font-semibold text-ink">{t("title")}</h3>

						{hasPaid && (
							<div className="flex gap-3 rounded-xl bg-warning/10 border border-warning/30 p-4">
								<AlertTriangle
									size={18}
									className="shrink-0 text-warning mt-0.5"
									aria-hidden="true"
								/>
								<div className="space-y-1">
									<p className="text-sm font-semibold text-ink">{t("warningTitle")}</p>
									<p className="text-sm text-ink-muted">
										{t("warningBody", { amount: formatRupiah(totalPaid) })}
									</p>
								</div>
							</div>
						)}

						<p className="text-sm text-ink-muted">{t("body")}</p>

						{error && (
							<p role="alert" className="text-xs text-danger">
								{error}
							</p>
						)}

						<div className="flex flex-col gap-2">
							<Button
								type="button"
								onClick={handleConfirm}
								loading={loading}
								variant="danger"
								size="md"
								className="w-full"
							>
								{loading ? tButtons("saving") : t("confirm")}
							</Button>
							<Button
								type="button"
								onClick={() => setOpen(false)}
								disabled={loading}
								variant="secondary"
								size="md"
								className="w-full"
							>
								{t("back")}
							</Button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
