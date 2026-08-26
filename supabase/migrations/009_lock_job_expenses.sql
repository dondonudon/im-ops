-- ============================================================
-- 009 — Lock job expenses once the job is settled
-- ============================================================
-- Hard DB counterpart to the client-side lock in the job ExpensePanel. Job
-- expenses (expense_type = 'job') become immutable — no INSERT / UPDATE / DELETE —
-- once the job is settled. "Settled" mirrors the app logic exactly and means ANY of:
--   1. the job is cancelled;
--   2. it has an active top-level invoice (master or standalone, non-cancelled) that
--      is fully paid — paid_amount (rolled up from termin children by trigger) covers
--      total_amount, and total_amount > 0; OR
--   3. it has no active invoice yet, but collected payments (refunds signed negative)
--      already cover the job's contracted revenue (jobs.revenue > 0).
-- Conditions 2 and 3 are mutually exclusive: once an active master exists, only the
-- invoice total decides — a job never falls back to the payments-vs-revenue check.
-- Operational expenses (job_id IS NULL) are never affected.
-- Run each statement in order.

-- 1. predicate: is a job's expense ledger locked? SECURITY DEFINER so the guard reads
--    the full picture regardless of the caller's RLS (matches recompute_invoice_paid).
CREATE OR REPLACE FUNCTION is_job_expenses_locked(p_job_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  j          jobs%ROWTYPE;
  master     invoices%ROWTYPE;
  has_master BOOLEAN;
  total_paid BIGINT;
BEGIN
  IF p_job_id IS NULL THEN RETURN FALSE; END IF;

  SELECT * INTO j FROM jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- (1) cancelled job
  IF j.status = 'cancelled' THEN RETURN TRUE; END IF;

  -- at most one active top-level invoice per job (idx_invoices_one_toplevel_per_job)
  SELECT * INTO master
  FROM invoices
  WHERE job_id = p_job_id AND parent_invoice_id IS NULL AND status <> 'cancelled'
  LIMIT 1;
  has_master := FOUND;

  -- (2) invoice fully paid — invoice total is the source of truth when one exists
  IF has_master THEN
    RETURN master.total_amount > 0 AND master.paid_amount >= master.total_amount;
  END IF;

  -- (3) no active invoice, but payments already cover contracted revenue
  SELECT COALESCE(SUM(CASE WHEN payment_type = 'refund' THEN -amount ELSE amount END), 0)
  INTO total_paid
  FROM payments WHERE job_id = p_job_id;

  RETURN COALESCE(j.revenue, 0) > 0 AND total_paid >= j.revenue;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog;

-- 2. guard trigger: reject any write to a locked job's expenses. Operational
--    expenses (job_id NULL) pass through untouched.
CREATE OR REPLACE FUNCTION assert_job_expenses_unlocked()
RETURNS TRIGGER AS $$
DECLARE
  target_job UUID;
BEGIN
  target_job := CASE WHEN TG_OP = 'DELETE' THEN OLD.job_id ELSE NEW.job_id END;

  IF target_job IS NOT NULL AND is_job_expenses_locked(target_job) THEN
    RAISE EXCEPTION
      'Job % expenses are locked (job cancelled or fully settled); % is not allowed.',
      target_job, lower(TG_OP)
      USING ERRCODE = 'check_violation';
  END IF;

  -- Moving an expense off a locked job counts as tampering with it too.
  IF TG_OP = 'UPDATE'
     AND OLD.job_id IS DISTINCT FROM NEW.job_id
     AND OLD.job_id IS NOT NULL
     AND is_job_expenses_locked(OLD.job_id) THEN
    RAISE EXCEPTION 'Source job % expenses are locked; cannot move this expense.', OLD.job_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS before_expense_lock_check ON expenses;
CREATE TRIGGER before_expense_lock_check
  BEFORE INSERT OR UPDATE OR DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION assert_job_expenses_unlocked();
