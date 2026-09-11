-- ============================================================
-- 013 — guard invoice total edits (floor: total >= paid, total > 0)
-- ============================================================
-- Invoice/termin totals are now operator-editable (migration 012 + the termin /
-- total inline editors). This trigger stops an edit from setting a total below the
-- cash already collected on that invoice (which would hide money) or to a non-
-- positive value. The legitimate discount case still works: lowering a termin to
-- exactly what was paid (e.g. 1,200 → 1,100 when 1,100 is paid) satisfies >= paid.
--
-- Fires ONLY when total_amount is written (BEFORE INSERT OR UPDATE OF total_amount),
-- so the payment path is untouched: payments update paid_amount via
-- recompute_invoice_paid, never total_amount, so a legitimate overpayment
-- (paid > total) still records without tripping this check.

CREATE OR REPLACE FUNCTION assert_invoice_total_valid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_amount <= 0 THEN
    RAISE EXCEPTION 'Invoice total must be greater than zero (got %).', NEW.total_amount;
  END IF;
  IF NEW.total_amount < NEW.paid_amount THEN
    RAISE EXCEPTION 'Invoice total (%) cannot be below the amount already paid (%).',
      NEW.total_amount, NEW.paid_amount;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS before_invoice_total_valid ON invoices;
CREATE TRIGGER before_invoice_total_valid
  BEFORE INSERT OR UPDATE OF total_amount ON invoices
  FOR EACH ROW EXECUTE FUNCTION assert_invoice_total_valid();
