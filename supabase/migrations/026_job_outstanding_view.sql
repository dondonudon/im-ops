-- job_outstanding view.
-- "Who still owes us money" at the JOB level. Payments live on jobs (a down
-- payment can be taken before an invoice is ever generated), so job AR must be
-- computed from payments vs job.revenue — not from invoices, which are optional.
--
-- This powers the /today "Needs you" queue without pulling every job + its
-- payment rows into the app and filtering there (which forced a fetch cap).
-- The view returns ONLY jobs with a positive balance, so the payload stays
-- tiny regardless of how many jobs exist over time.
--
-- security_invoker = true → the caller's RLS applies, same as querying the
-- base tables directly.

CREATE OR REPLACE VIEW job_outstanding
WITH (security_invoker = true) AS
SELECT
  j.id,
  j.job_number,
  j.move_date,
  j.revenue,
  c.name AS customer_name,
  -- Paid to date: sum of payments, refunds subtracted (matches PaymentsPanel).
  COALESCE(pay.paid, 0)::BIGINT AS paid,
  (j.revenue - COALESCE(pay.paid, 0))::BIGINT AS outstanding,
  (COALESCE(pay.paid, 0) > 0) AS partial,
  -- Mirrors the invoice_outstanding "overdue" rule; lets callers dedupe a job
  -- that is already surfaced as an overdue invoice.
  COALESCE(
    i.due_date < CURRENT_DATE AND i.status NOT IN ('paid', 'cancelled'),
    false
  ) AS invoice_overdue
FROM jobs j
LEFT JOIN proposals pr ON pr.id = j.proposal_id
LEFT JOIN leads     l  ON l.id  = pr.lead_id
LEFT JOIN customers c  ON c.id  = l.customer_id
LEFT JOIN invoices  i  ON i.job_id = j.id  -- invoices.job_id is UNIQUE → no fan-out
LEFT JOIN LATERAL (
  SELECT SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount ELSE p.amount END) AS paid
  FROM payments p
  WHERE p.job_id = j.id
) pay ON true
WHERE j.status = 'scheduled'
  AND (j.revenue - COALESCE(pay.paid, 0)) > 0;
