"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Card, FormError, Money } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

type Payment = {
	id: string;
	payment_type: string;
	method: string | null;
	amount: number;
	paid_at: string;
	notes: string | null;
};

/**
 * Lists job-level payments not yet attached to any termin and lets the operator
 * attach one to this invoice (sets payments.invoice_id → the recompute trigger
 * rolls it into this leaf + its master). Used on a child/leaf invoice's detail.
 */
export function AttachablePayments({
	invoiceId,
	payments: initial,
}: {
	jobId: string;
	invoiceId: string;
	payments: Payment[];
}) {
	const router = useRouter();
	const tPanel = useTranslations("panels.payments");
	const tPaymentType = useTranslations("entity.paymentType");
	const [isPending, startTransition] = useTransition();
	const [payments, setPayments] = useState(initial);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	if (payments.length === 0) return null;

	async function attach(paymentId: string) {
		setBusy(paymentId);
		setError(null);
		const supabase = createClient();
		const { error: updErr } = await supabase
			.from("payments")
			.update({ invoice_id: invoiceId })
			.eq("id", paymentId);
		setBusy(null);
		if (updErr) {
			setError(updErr.message);
			return;
		}
		setPayments((prev) => prev.filter((p) => p.id !== paymentId));
		startTransition(() => router.refresh());
	}

	return (
		<Card className="divide-y divide-line">
			<p className="px-4 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">
				{tPanel("attachExisting")}
			</p>
			{error && (
				<div className="px-4 py-2">
					<FormError>{error}</FormError>
				</div>
			)}
			{payments.map((p) => (
				<div key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
					<div className="flex-1 min-w-0">
						<span className="font-medium text-ink">{tPaymentType(p.payment_type)}</span>
						<span className="block text-xs text-ink-faint">{formatDate(p.paid_at)}</span>
					</div>
					<Money value={p.amount} tone="positive" className="font-medium" />
					<Button
						type="button"
						variant="secondary"
						size="sm"
						loading={busy === p.id}
						disabled={isPending || busy != null}
						onClick={() => attach(p.id)}
					>
						{tPanel("attach")}
					</Button>
				</div>
			))}
		</Card>
	);
}
