-- Atomic job number generator.
-- Uses LOCK TABLE to prevent race conditions when two operators convert
-- proposals simultaneously, matching the safety level of generate_proposal_number.
-- Format: JOB-{YYYY}-{NNNN}  e.g. JOB-2026-0042

CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TEXT AS $$
DECLARE
  seq      INTEGER;
  year_val TEXT;
BEGIN
  -- Serialise concurrent calls so two simultaneous inserts can't get the same number.
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
