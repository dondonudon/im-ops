import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ExpensePanel } from "@/components/jobs/ExpensePanel";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.jobDetail");
	const tExpense = await getTranslations("forms.expense");

	const [{ data: job }, { data: expenses }, { data: invoice }] = await Promise.all([
		supabase.from("jobs").select("id, job_number, status").eq("id", id).single(),
		supabase
			.from("expenses")
			.select("id, category, description, amount, incurred_at, receipt_url")
			.eq("job_id", id)
			.order("incurred_at", { ascending: false }),
		supabase.from("invoices").select("status").eq("job_id", id).maybeSingle(),
	]);

	if (!job) notFound();

	let lockReason: string | null = null;
	if (job.status === "cancelled") lockReason = tExpense("lockedJobCancelled");
	else if (invoice?.status === "paid") lockReason = tExpense("lockedInvoicePaid");

	return (
		<div className="space-y-6 max-w-lg">
			<PageHeader
				title={t("expenses")}
				subtitle={
					<Link
						href={`/jobs/${id}`}
						className="text-xs text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
					>
						← {job.job_number}
					</Link>
				}
			/>

			<ExpensePanel jobId={id} expenses={expenses ?? []} lockReason={lockReason} />
		</div>
	);
}
