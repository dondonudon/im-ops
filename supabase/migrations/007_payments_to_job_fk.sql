-- ============================================================
-- 007: Move payments FK from invoices.id to jobs.id
-- ============================================================
-- The original schema FK'd payments to invoices, which means a customer
-- down payment cannot be recorded until an invoice exists. The spec calls
-- for payments to live at the job level so DPs can be taken on a scheduled
-- (not yet invoiced) job. This migration:
--
--   1. Adds payments.job_id (nullable initially)
--   2. Backfills it from payments.invoice_id → invoices.job_id
--   3. Drops the invoice_id column and FK
--   4. Makes job_id NOT NULL + adds the FK to jobs
--   5. Recreates update_invoice_status so it matches by job_id
--
-- Re-runnable: guarded by column existence checks.
-- ============================================================

-- 1. Add job_id (nullable for now so we can backfill).
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE RESTRICT;

-- 2. Backfill from the invoice link, if invoice_id still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'invoice_id'
  ) THEN
    UPDATE payments p
    SET job_id = i.job_id
    FROM invoices i
    WHERE i.id = p.invoice_id
      AND p.job_id IS NULL;
  END IF;
END $$;

-- 3. Drop the trigger before we change the column it depends on.
DROP TRIGGER IF EXISTS after_payment_insert ON payments;

-- 4. Drop invoice_id (and its FK) now that the data is backfilled.
ALTER TABLE payments
  DROP COLUMN IF EXISTS invoice_id;

-- 5. Make job_id required.
ALTER TABLE payments
  ALTER COLUMN job_id SET NOT NULL;

-- 6. Recreate the trigger function to match payments → invoice by job_id.
CREATE OR REPLACE FUNCTION update_invoice_status()
RETURNS TRIGGER AS $$
DECLARE
  total_paid    BIGINT;
  invoice_total BIGINT;
  target_job_id UUID;
BEGIN
  target_job_id := COALESCE(NEW.job_id, OLD.job_id);

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_type != 'refund'), 0)
    - COALESCE(SUM(amount) FILTER (WHERE payment_type = 'refund'), 0)
  INTO total_paid
  FROM payments
  WHERE job_id = target_job_id;

  SELECT total_amount INTO invoice_total
  FROM invoices WHERE job_id = target_job_id;

  IF invoice_total IS NULL THEN
    -- No invoice yet — nothing to update. Payment is still persisted
    -- (this is exactly the DP-before-invoice case the spec wants).
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE invoices
  SET paid_amount = total_paid,
      status = CASE
        WHEN total_paid >= invoice_total THEN 'paid'
        WHEN total_paid > 0              THEN 'partially_paid'
        ELSE 'sent'
      END
  WHERE job_id = target_job_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_payment_insert
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_invoice_status();
