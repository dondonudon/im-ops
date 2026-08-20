-- ============================================================
-- 008 — Operational expenses (expenses with no parent job)
-- ============================================================
-- Adds an expense_type discriminator so the business can log spend that isn't tied
-- to a job (bulk packing materials, ads, utilities). The full cost lands in the
-- month it was purchased (cash basis, bucketed by incurred_at).
--
-- The two CHECK constraints below are the load-bearing part: they pair expense_type
-- with job_id so the two kinds can never be confused. Because an operational expense
-- is guaranteed to have job_id IS NULL, every job-scoped query in the app (anything
-- with a job_id predicate or join) is structurally incapable of seeing one — so job
-- profit reporting needs no changes.
--
-- PRE-FLIGHT (verified 0 on 2026-08-18, before applying):
--   SELECT count(*) FROM expenses WHERE job_id IS NULL;
-- Must be 0. Step 2 validates existing rows immediately and will abort the whole
-- migration if any orphan exists. If it ever returns non-zero on another environment,
-- run `UPDATE expenses SET expense_type = 'operational' WHERE job_id IS NULL;`
-- between steps 1 and 2.
--
-- See docs/monetary-refactor-plan.md. Run each statement in order.

-- 1. the discriminator. Existing rows all become 'job' via the DEFAULT — no data
--    migration needed. expenses.job_id was already nullable (001:185).
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS expense_type TEXT NOT NULL DEFAULT 'job'
    CHECK (expense_type IN ('job', 'operational'));

-- 2. a job expense MUST have a job.
ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS chk_job_expense_has_job;
ALTER TABLE expenses
  ADD CONSTRAINT chk_job_expense_has_job
    CHECK (expense_type <> 'job' OR job_id IS NOT NULL);

-- 3. an operational expense MUST NOT have a job — otherwise it would leak into
--    job_profit_summary (which joins on job_id) and inflate per-job actual spend.
ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS chk_operational_expense_has_no_job;
ALTER TABLE expenses
  ADD CONSTRAINT chk_operational_expense_has_no_job
    CHECK (expense_type <> 'operational' OR job_id IS NULL);

-- 4. partial index for the Money page's month-scoped operational expense list.
--    Partial because operational rows are a small minority of the table.
CREATE INDEX IF NOT EXISTS idx_expenses_operational_incurred_at
  ON expenses (incurred_at)
  WHERE expense_type = 'operational';

-- 5. job_profit_summary: filter the expense join to job expenses only. Redundant
--    given constraint 3, but a view is worth being explicit in — it's read by
--    callers that can't see the constraint.
--
--    NOTE: this is the 007 definition (cash_received derived from PAYMENTS via a
--    LATERAL join, so a master + its termin children count each payment exactly
--    once) with ONE clause added. Do NOT restore the older 001 version that joined
--    `invoices` and read i.paid_amount — that would silently revert the 007 fix.
CREATE OR REPLACE VIEW job_profit_summary
WITH (security_invoker = true) AS
SELECT
  j.id AS job_id,
  j.job_number,
  j.revenue,
  j.status,
  COALESCE(SUM(e.amount), 0)::BIGINT AS actual_spend,
  (j.revenue - COALESCE(SUM(e.amount), 0))::BIGINT AS current_profit,
  COALESCE(pay.paid, 0)::BIGINT AS cash_received
FROM jobs j
LEFT JOIN expenses e ON e.job_id = j.id AND e.expense_type = 'job'
LEFT JOIN LATERAL (
  SELECT SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount ELSE p.amount END) AS paid
  FROM payments p WHERE p.job_id = j.id
) pay ON true
GROUP BY j.id, pay.paid;
