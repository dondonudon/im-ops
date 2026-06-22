"use client";
import { FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useState } from "react";
import { Button, FormError } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Generates an invoice for a given job and redirects to its detail page.
 * Invoice number format: INV/{YEAR}/{ROMAN_MONTH}/{SEQ}
 * Total amount is pre-filled with the job revenue.
 * Number generation is atomic via the generate_invoice_number() Postgres function.
 */
export function GenerateInvoiceButton({
	jobId,
	jobRevenue,
}: {
	jobId: string;
	jobRevenue: number;
}) {
	const router = useRouter();
	const t = useTranslations("actions");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleClick() {
		setLoading(true);
		setError(null);
		try {
			const supabase = createClient();

			// generate_invoice_number() uses LOCK TABLE to prevent race conditions
			const { data: invoiceNumber, error: rpcErr } = await supabase.rpc("generate_invoice_number");
			if (rpcErr) throw rpcErr;

			const { data, error: insertErr } = await supabase
				.from("invoices")
				.insert({
					job_id: jobId,
					invoice_number: invoiceNumber as string,
					total_amount: jobRevenue,
					paid_amount: 0,
					status: "sent",
				})
				.select("id")
				.single();

			if (insertErr) throw insertErr;
			router.push(`/invoices/${data.id}`);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Failed to create invoice.");
			setLoading(false);
		}
	}

	return (
		<div>
			<Button
				type="button"
				variant="primary"
				size="md"
				onClick={handleClick}
				loading={loading}
				className="w-full"
				aria-label="Generate invoice for this job"
			>
				{loading ? (
					<>
						<Loader2 size={14} className="animate-spin" aria-hidden="true" />
						{t("generating")}
					</>
				) : (
					<>
						<FileText size={14} aria-hidden="true" />
						{t("generateInvoice")}
					</>
				)}
			</Button>
			{error && <FormError>{error}</FormError>}
		</div>
	);
}
