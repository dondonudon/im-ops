-- ============================================================
-- 014 — Configurable grace period on the job expense lock
-- ============================================================
-- After a job settles (invoice fully paid, or payments cover revenue), operators
-- have N calendar days (Asia/Jakarta) to log straggler expenses (fuel, toll,
-- crew overtime) before the ledger locks. N is stored in system_settings under
-- key 'expense_grace_days' (default 3). Cancelled jobs lock immediately.
-- Re-creates is_job_expenses_locked() in place; the trigger needs no change.

-- Seed the setting; skip if it already exists (idempotent).
INSERT INTO system_settings (key, value, category, description)
VALUES ('expense_grace_days', '3', 'invoice', 'Days operators can log expenses after full payment')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION is_job_expenses_locked(p_job_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  j            jobs%ROWTYPE;
  master       invoices%ROWTYPE;
  has_master   BOOLEAN;
  total_paid   BIGINT;
  settled_date DATE;
  today_jkt    DATE;
  grace_days   INT;
BEGIN
  IF p_job_id IS NULL THEN RETURN FALSE; END IF;

  SELECT * INTO j FROM jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- (1) Cancelled job — lock immediately, no grace period.
  IF j.status = 'cancelled' THEN RETURN TRUE; END IF;

  today_jkt := (NOW() AT TIME ZONE 'Asia/Jakarta')::date;

  -- Read grace window from settings; fall back to 3 days if missing or non-numeric.
  BEGIN
    SELECT value::int INTO grace_days FROM system_settings WHERE key = 'expense_grace_days';
  EXCEPTION WHEN others THEN
    grace_days := 3;
  END;
  IF grace_days IS NULL THEN grace_days := 3; END IF;

  -- at most one active top-level invoice per job (idx_invoices_one_toplevel_per_job)
  SELECT * INTO master
  FROM invoices
  WHERE job_id = p_job_id AND parent_invoice_id IS NULL AND status <> 'cancelled'
  LIMIT 1;
  has_master := FOUND;

  -- (2) Invoice fully paid — invoice total is source of truth when one exists.
  IF has_master THEN
    IF NOT (master.total_amount > 0 AND master.paid_amount >= master.total_amount) THEN
      RETURN FALSE; -- not yet settled
    END IF;
    -- Settled: apply grace window from the latest payment timestamp on this job.
    -- paid_at is a UTC timestamp; convert to Jakarta date before comparing.
    SELECT MAX((paid_at AT TIME ZONE 'Asia/Jakarta')::date) INTO settled_date
    FROM payments WHERE job_id = p_job_id;
    IF settled_date IS NULL THEN RETURN TRUE; END IF; -- no timestamp to anchor grace: lock now
    RETURN (today_jkt - settled_date) > grace_days;
  END IF;

  -- (3) No active invoice, but payments already cover contracted revenue.
  SELECT COALESCE(SUM(CASE WHEN payment_type = 'refund' THEN -amount ELSE amount END), 0)
  INTO total_paid
  FROM payments WHERE job_id = p_job_id;

  IF NOT (COALESCE(j.revenue, 0) > 0 AND total_paid >= j.revenue) THEN
    RETURN FALSE; -- not yet settled
  END IF;
  -- Settled: apply grace window from the latest payment timestamp on this job.
  SELECT MAX((paid_at AT TIME ZONE 'Asia/Jakarta')::date) INTO settled_date
  FROM payments WHERE job_id = p_job_id;
  IF settled_date IS NULL THEN RETURN TRUE; END IF;
  RETURN (today_jkt - settled_date) > grace_days;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog;
