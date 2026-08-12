-- ============================================================
-- 007 — Split invoices (payable master + termin children)
-- ============================================================
-- A job may have one master invoice (grand total, parent_invoice_id IS NULL) plus N
-- child termin (parent_invoice_id = master.id). Payments attach to LEAF invoices;
-- master.paid_amount rolls up from children (+ any direct payments). Views/AR de-dup
-- so a master and its children are never counted together. Run each statement in order.

-- 1. allow many invoices per job (drop the one-per-job UNIQUE; keep FK + plain index)
--    Inline column UNIQUE → auto-named 'invoices_job_id_key'. Verify with \d invoices if it errors.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_job_id_key;

-- 2. hierarchy + label
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS label TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_parent_id ON invoices (parent_invoice_id) WHERE parent_invoice_id IS NOT NULL;

-- 2a. enforce AT MOST ONE top-level invoice (master or standalone) per job — the dropped
--     job_id UNIQUE otherwise leaves nothing stopping two masters. Satisfiable now (data is
--     strictly 1:1). Excludes 'cancelled' so a job can be re-invoiced after a future cancel.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_toplevel_per_job
  ON invoices (job_id)
  WHERE parent_invoice_id IS NULL AND status <> 'cancelled';

-- 3. payments → invoice link (nullable; RESTRICT so recorded money can't be orphaned by a delete)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments (invoice_id) WHERE invoice_id IS NOT NULL;

-- 3a. backfill: each existing payment → its job's lone invoice (currently strictly 1:1)
UPDATE payments p
SET invoice_id = i.id
FROM invoices i
WHERE i.job_id = p.job_id AND p.invoice_id IS NULL;

-- 4. per-invoice paid/status recompute + one-level parent rollup (robust: master keeps its
--    own direct payments AND children's, so splitting a paid invoice never loses money)
CREATE OR REPLACE FUNCTION recompute_invoice_paid(inv_id UUID)
RETURNS VOID AS $$
DECLARE
  inv         invoices%ROWTYPE;
  child_paid  BIGINT;
  direct_paid BIGINT;
  new_paid    BIGINT;
BEGIN
  IF inv_id IS NULL THEN RETURN; END IF;
  SELECT * INTO inv FROM invoices WHERE id = inv_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(paid_amount), 0) INTO child_paid
  FROM invoices WHERE parent_invoice_id = inv_id;

  SELECT COALESCE(SUM(CASE WHEN payment_type = 'refund' THEN -amount ELSE amount END), 0)
  INTO direct_paid
  FROM payments WHERE invoice_id = inv_id;

  new_paid := child_paid + direct_paid;

  UPDATE invoices
  SET paid_amount = new_paid,
      status = CASE
        WHEN status = 'cancelled'          THEN 'cancelled'
        WHEN new_paid >= total_amount      THEN 'paid'
        WHEN new_paid > 0                  THEN 'partially_paid'
        ELSE 'sent'
      END
  WHERE id = inv_id;

  IF inv.parent_invoice_id IS NOT NULL THEN
    PERFORM recompute_invoice_paid(inv.parent_invoice_id);  -- depth 1 (no grandchildren)
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- 5. rewrite the payment trigger fn to recompute the affected invoice(s). The existing
--    trigger 'after_payment_insert' (AFTER INS/UPD/DEL on payments) already calls this fn —
--    leave the CREATE TRIGGER alone.
CREATE OR REPLACE FUNCTION update_invoice_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recompute_invoice_paid(NEW.invoice_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM recompute_invoice_paid(NEW.invoice_id);
    IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      PERFORM recompute_invoice_paid(OLD.invoice_id);   -- reassignment: fix the old target too
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recompute_invoice_paid(OLD.invoice_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- 6. guard: a payment may only attach to a LEAF invoice (never a master that has children)
CREATE OR REPLACE FUNCTION assert_payment_on_leaf_invoice()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM invoices c WHERE c.parent_invoice_id = NEW.invoice_id) THEN
    RAISE EXCEPTION 'Payment cannot attach to master invoice % (it has children). Attach to a child termin.', NEW.invoice_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS before_payment_leaf_check ON payments;
CREATE TRIGGER before_payment_leaf_check
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION assert_payment_on_leaf_invoice();

-- 7. fix job_profit_summary: derive cash_received from PAYMENTS (not i.paid_amount) so a
--    master+children job counts each payment exactly once.
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
LEFT JOIN expenses e ON e.job_id = j.id
LEFT JOIN LATERAL (
  SELECT SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount ELSE p.amount END) AS paid
  FROM payments p WHERE p.job_id = j.id
) pay ON true
GROUP BY j.id, pay.paid;

-- 8. fix job_outstanding: drop the fan-out LEFT JOIN invoices; compute invoice_overdue from
--    a leaf-only subquery so a multi-invoice job appears exactly once.
CREATE OR REPLACE VIEW job_outstanding
WITH (security_invoker = true) AS
SELECT
  j.id,
  j.job_number,
  j.move_date,
  j.revenue,
  c.name AS customer_name,
  COALESCE(pay.paid, 0)::BIGINT AS paid,
  (j.revenue - COALESCE(pay.paid, 0))::BIGINT AS outstanding,
  (COALESCE(pay.paid, 0) > 0) AS partial,
  COALESCE((
    SELECT bool_or(i.due_date < CURRENT_DATE AND i.status NOT IN ('paid','cancelled'))
    FROM invoices i
    WHERE i.job_id = j.id
      AND NOT EXISTS (SELECT 1 FROM invoices ch WHERE ch.parent_invoice_id = i.id)  -- leaves only
  ), false) AS invoice_overdue
FROM jobs j
LEFT JOIN proposals pr ON pr.id = j.proposal_id
LEFT JOIN leads     l  ON l.id  = pr.lead_id
LEFT JOIN customers c  ON c.id  = l.customer_id
LEFT JOIN LATERAL (
  SELECT SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount ELSE p.amount END) AS paid
  FROM payments p WHERE p.job_id = j.id
) pay ON true
WHERE j.status = 'scheduled'
  AND (j.revenue - COALESCE(pay.paid, 0)) > 0;

-- 9. fix invoice_outstanding: exclude masters-that-have-children (leaves + standalone only) so
--    AR (get_ar_totals reads this) never counts a master on top of its termin.
CREATE OR REPLACE VIEW invoice_outstanding
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.invoice_number,
  i.total_amount,
  i.paid_amount AS paid,
  (i.total_amount - i.paid_amount) AS outstanding,
  i.due_date,
  CASE
    WHEN i.due_date < CURRENT_DATE AND i.status NOT IN ('paid','cancelled') THEN 'overdue'
    ELSE i.status
  END AS effective_status
FROM invoices i
WHERE NOT EXISTS (SELECT 1 FROM invoices ch WHERE ch.parent_invoice_id = i.id);

-- 10. fix get_invoice_status_breakdown: same leaf-only filter.
CREATE OR REPLACE FUNCTION get_invoice_status_breakdown()
RETURNS TABLE(status TEXT, inv_count BIGINT, total_amount BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT
    CASE
      WHEN due_date < CURRENT_DATE AND status NOT IN ('paid','cancelled') THEN 'overdue'
      ELSE status
    END AS status,
    COUNT(*) AS inv_count,
    SUM(total_amount)::BIGINT AS total_amount
  FROM invoices i
  WHERE status != 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM invoices ch WHERE ch.parent_invoice_id = i.id)
  GROUP BY 1;
$$;
