-- ============================================================
-- 012 — recompute invoice status when total_amount is edited
-- ============================================================
-- Editing invoices.total_amount (applying a post-issue discount or scope change
-- to an open termin) must re-derive that invoice's status. Example: a termin with
-- total 1,200 and paid 1,100 sits at 'partially_paid'; lowering total to 1,100
-- should flip it to 'paid'. Until now only payment writes recomputed status (the
-- after_payment_insert trigger → recompute_invoice_paid, migration 007). A direct
-- UPDATE of total_amount (client PostgREST) never re-ran that logic, so the status
-- and any leaf-level AR went stale. This trigger closes that gap.
--
-- No recursion: recompute_invoice_paid() only ever UPDATEs paid_amount + status,
-- never total_amount, so an "AFTER UPDATE OF total_amount" trigger cannot re-fire
-- itself. (It also recurses to the parent's paid rollup, which is a no-op here —
-- a child's total does not change the master's paid_amount — but stays consistent.)

CREATE OR REPLACE FUNCTION recompute_invoice_on_total_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    PERFORM recompute_invoice_paid(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS after_invoice_total_change ON invoices;
CREATE TRIGGER after_invoice_total_change
  AFTER UPDATE OF total_amount ON invoices
  FOR EACH ROW EXECUTE FUNCTION recompute_invoice_on_total_change();
