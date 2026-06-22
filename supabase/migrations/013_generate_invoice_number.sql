-- Atomic invoice number generator.
-- Replaces the client-side count-then-insert race condition in GenerateInvoiceButton.tsx.
-- Format: INV/{YEAR}/{ROMAN_MONTH}/{SEQ}  e.g. INV/2026/VI/001
-- Uses LOCK TABLE to prevent concurrent duplicates (same pattern as generate_job_number).

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  seq          INTEGER;
  month_roman  TEXT;
  year_val     TEXT;
  month_start  TIMESTAMPTZ;
  month_end    TIMESTAMPTZ;
  roman_months TEXT[] := ARRAY['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
BEGIN
  LOCK TABLE invoices IN SHARE ROW EXCLUSIVE MODE;

  month_start := DATE_TRUNC('month', now());
  month_end   := month_start + INTERVAL '1 month';

  SELECT COALESCE(COUNT(*), 0) + 1
  INTO seq
  FROM invoices
  WHERE created_at >= month_start
    AND created_at <  month_end;

  month_roman := roman_months[EXTRACT(MONTH FROM now())];
  year_val    := TO_CHAR(now(), 'YYYY');

  RETURN 'INV/' || year_val || '/' || month_roman || '/' || LPAD(seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;
