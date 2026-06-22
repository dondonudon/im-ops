-- SEC-03: Add SET search_path to all SECURITY DEFINER functions.
-- Fixes search_path injection risk per PostgreSQL security guidance.
-- Re-declares the four functions originally defined in 001 and 002 with the
-- required SET search_path = public, pg_catalog clause.

CREATE OR REPLACE FUNCTION generate_proposal_number(service_type TEXT DEFAULT 'DOM')
RETURNS TEXT AS $$
DECLARE
  seq         INTEGER;
  month_roman TEXT;
  year_val    TEXT;
  roman_months TEXT[] := ARRAY['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(proposal_number, '/', 1) AS INTEGER)
  ), 0) + 1
  INTO seq
  FROM proposals
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now());

  month_roman := roman_months[EXTRACT(MONTH FROM now())];
  year_val    := TO_CHAR(now(), 'YYYY');

  RETURN seq || '/' || service_type || '-IM/' || month_roman || '/' || year_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

-- ---

CREATE OR REPLACE FUNCTION check_resource_overlap(
  p_type      TEXT,
  p_id        UUID,
  p_date      DATE
)
RETURNS TABLE(job_id UUID, job_number TEXT, move_date DATE) AS $$
BEGIN
  RETURN QUERY
  SELECT j.id, j.job_number, j.move_date
  FROM job_assignments ja
  JOIN jobs j ON j.id = ja.job_id
  WHERE ja.assignment_type = p_type
    AND (
      (p_type = 'fleet' AND ja.fleet_id = p_id)
      OR
      (p_type = 'crew'   AND ja.crew_id   = p_id)
    )
    AND j.move_date = p_date
    AND j.status NOT IN ('cancelled','closed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

-- ---

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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

-- ---

CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TEXT AS $$
DECLARE
  seq      INTEGER;
  year_val TEXT;
BEGIN
  LOCK TABLE jobs IN SHARE ROW EXCLUSIVE MODE;

  SELECT COALESCE(
    MAX(
      CAST(SPLIT_PART(job_number, '-', 3) AS INTEGER)
    ), 0
  ) + 1
  INTO seq
  FROM jobs
  WHERE job_number LIKE 'JOB-' || TO_CHAR(now(), 'YYYY') || '-%'
    AND job_number ~ '^JOB-\d{4}-\d+$';

  year_val := TO_CHAR(now(), 'YYYY');

  RETURN 'JOB-' || year_val || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;
