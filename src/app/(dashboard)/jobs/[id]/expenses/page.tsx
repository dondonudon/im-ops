import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ExpensePanel } from "@/components/jobs/ExpensePanel";
import { PageHeader } from "@/components/ui";
import { deriveInvoiceStatus } from "@/lib/invoices";
import { getSystemSettings } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { todayInJakarta } from "@/lib/utils";

export default async function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.jobDetail");
	const tExpense = await getTranslations("forms.expense");

	const [settings, [{ data: job }, { data: expenses }, { data: invoices }, { data: payments }]] =
		await Promise.all([
			getSystemSettings(),
			Promise.all([
				supabase.from("jobs").select("id, job_number, status, revenue").eq("id", id).single(),
				supabase
					.from("expenses")
					.select("id, category, description, amount, incurred_at, receipt_url")
					.eq("job_id", id)
					.order("incurred_at", { ascending: false })
					.order("created_at", { ascending: false }),
				// A job may now have many invoices (master + termin children). Only the
				// active master (parent_invoice_id IS NULL, non-cancelled) carries the
				// rolled-up job-level paid/total, so fetch enough to derive "fully paid".
				supabase
					.from("invoices")
					.select("status, total_amount, paid_amount, parent_invoice_id")
					.eq("job_id", id),
				// Payments are job-level; a pre-invoice DP carries invoice_id NULL. Needed
				// to lock a job that's been fully collected before any invoice was raised.
				// paid_at is used to compute the grace period after settlement.
				supabase.from("payments").select("amount, paid_at, payment_type").eq("job_id", id),
			]),
		]);

	if (!job) notFound();

	// Lock #1 — invoice fully paid. "Fully paid" is a job-level notion: the master
	// invoice's paid_amount (rolled up from its termin children by trigger) covers
	// its total. A single paid termin must NOT lock the panel — that was the
	// pre-split bug where `.some(paid)` fired on the first DP.
	const master = (invoices ?? []).find(
		(i) => i.parent_invoice_id === null && i.status !== "cancelled",
	);
	const hasInvoice = master != null;
	const invoiceFullyPaid =
		hasInvoice &&
		(master.total_amount ?? 0) > 0 &&
		deriveInvoiceStatus(master.paid_amount ?? 0, master.total_amount ?? 0) === "paid";

	// Lock #2 — no invoice raised yet, but collected payments already cover the
	// job's contracted revenue (base + adjustments). Compare against job.revenue
	// since there's no invoice total to lean on.
	const totalPaid = (payments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);
	const jobRevenue = job.revenue ?? 0;
	const paidWithoutInvoice = !hasInvoice && jobRevenue > 0 && totalPaid >= jobRevenue;

	const graceDays = Math.max(
		0,
		Number(settings.find((s) => s.key === "expense_grace_days")?.value ?? 3),
	);

	let lockReason: string | null = null;
	let graceEndsAt: string | null = null;

	if (job.status === "cancelled") {
		lockReason = tExpense("lockedJobCancelled");
	} else if (invoiceFullyPaid || paidWithoutInvoice) {
		// Find the latest payment date to anchor the grace window.
		// Convert paid_at (UTC timestamp) to Jakarta calendar date for grace comparison.
		const latestPaidDate =
			(payments ?? [])
				.map((p) =>
					p.paid_at
						? new Date(p.paid_at).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
						: null,
				)
				.filter((d): d is string => Boolean(d))
				.sort()
				.at(-1) ?? null;

		if (latestPaidDate) {
			const today = todayInJakarta();
			const daysSince =
				(new Date(today).getTime() - new Date(latestPaidDate).getTime()) / (1000 * 60 * 60 * 24);

			if (daysSince <= graceDays) {
				// Within grace window — panel stays open; surface the close date.
				const graceEndMs = new Date(latestPaidDate).getTime() + graceDays * 24 * 60 * 60 * 1000;
				graceEndsAt = new Date(graceEndMs).toLocaleDateString("en-CA");
			} else {
				lockReason = invoiceFullyPaid ? tExpense("lockedInvoicePaid") : tExpense("lockedFullyPaid");
			}
		} else {
			// No paid_date on any payment (edge case) — lock immediately.
			lockReason = invoiceFullyPaid ? tExpense("lockedInvoicePaid") : tExpense("lockedFullyPaid");
		}
	}

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

			<ExpensePanel
				jobId={id}
				expenses={expenses ?? []}
				lockReason={lockReason}
				graceEndsAt={graceEndsAt}
			/>
		</div>
	);
}
