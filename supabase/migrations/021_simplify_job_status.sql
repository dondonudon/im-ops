-- Simplify job status: only 'scheduled' and 'cancelled' are stored in the DB.
-- All other display states (upcoming / today / done) are derived in the app
-- by comparing move_date against the current date.

-- 1. Backfill legacy statuses to 'scheduled'
UPDATE jobs SET status = 'scheduled'
WHERE status IN ('in_progress', 'completed', 'closed');

-- 2. Replace the CHECK constraint
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('scheduled', 'cancelled'));

-- 3. Recreate check_resource_overlap without the 'closed' exclusion
--    (previously: j.status NOT IN ('cancelled','closed'))
CREATE OR REPLACE FUNCTION check_resource_overlap(
  p_type TEXT,
  p_id   UUID,
  p_date DATE
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
      (p_type = 'crew'  AND ja.crew_id  = p_id)
    )
    AND j.move_date = p_date
    AND j.status != 'cancelled';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;
