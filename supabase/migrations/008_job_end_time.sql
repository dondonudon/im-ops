-- ============================================================
-- 008: Add move_end_time to jobs
-- ============================================================
-- Previously the schema only stored move_end_date, and Google Calendar
-- events fell back to a hardcoded 18:00 end. This adds an explicit end-time
-- so multi-day or non-standard-hours jobs get a correct GCal span.
--
-- NULL keeps the previous fallback behaviour (move_time + 8h, or 18:00).
-- Re-runnable.
-- ============================================================

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS move_end_time TIME;

COMMENT ON COLUMN jobs.move_end_time IS
  'Optional end time. If NULL, downstream code defaults to move_time + 8h, or 18:00 when move_time is NULL.';
