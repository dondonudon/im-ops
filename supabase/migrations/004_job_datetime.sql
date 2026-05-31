-- Migration: add move_time and move_end_date to jobs
-- move_time: optional start time (e.g. "08:00:00")
-- move_end_date: optional end date for multi-day jobs; when null the job is single-day

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS move_time     TIME,
  ADD COLUMN IF NOT EXISTS move_end_date DATE;

COMMENT ON COLUMN jobs.move_time     IS 'Optional start time on move_date';
COMMENT ON COLUMN jobs.move_end_date IS 'End date for multi-day moves; NULL = same day as move_date';
