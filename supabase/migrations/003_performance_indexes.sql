-- Performance indexes for all high-frequency query paths.
-- Safe to re-run: IF NOT EXISTS guards every statement.

-- jobs: status filter (board view, today page active-job count) + date ordering
CREATE INDEX IF NOT EXISTS idx_jobs_status
  ON jobs (status);

CREATE INDEX IF NOT EXISTS idx_jobs_move_date
  ON jobs (move_date DESC);

-- Composite covering index for the "upcoming jobs" query pattern
-- (status IN ('scheduled','in_progress') + move_date ORDER BY)
CREATE INDEX IF NOT EXISTS idx_jobs_status_move_date
  ON jobs (status, move_date DESC);

-- job_assignments: all detail pages filter by job_id
CREATE INDEX IF NOT EXISTS idx_job_assignments_job_id
  ON job_assignments (job_id);

-- expenses: job detail + monthly roll-up queries
CREATE INDEX IF NOT EXISTS idx_expenses_job_id
  ON expenses (job_id);

CREATE INDEX IF NOT EXISTS idx_expenses_incurred_at
  ON expenses (incurred_at);

-- payments: job detail, invoice sync trigger, monthly queries
CREATE INDEX IF NOT EXISTS idx_payments_job_id
  ON payments (job_id);

-- invoices: job detail lookup + status queries
CREATE INDEX IF NOT EXISTS idx_invoices_job_id
  ON invoices (job_id);

CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON invoices (status);

-- job_timeline: ordered lookup by job
CREATE INDEX IF NOT EXISTS idx_job_timeline_job_id
  ON job_timeline (job_id);

-- proposals: join from jobs → proposals → leads (proposal_id already covered by
-- the UNIQUE constraint; lead_id is needed for the reverse join from leads)
CREATE INDEX IF NOT EXISTS idx_proposals_lead_id
  ON proposals (lead_id);

CREATE INDEX IF NOT EXISTS idx_proposals_status
  ON proposals (status);

-- leads: status-filtered queries (today page, pipeline)
CREATE INDEX IF NOT EXISTS idx_leads_status
  ON leads (status);

CREATE INDEX IF NOT EXISTS idx_leads_customer_id
  ON leads (customer_id);

-- lead_photos: gallery lookup by lead
CREATE INDEX IF NOT EXISTS idx_lead_photos_lead_id
  ON lead_photos (lead_id);

-- surveys: join from leads
CREATE INDEX IF NOT EXISTS idx_surveys_lead_id
  ON surveys (lead_id);

-- survey_media: join from surveys
CREATE INDEX IF NOT EXISTS idx_survey_media_survey_id
  ON survey_media (survey_id);

-- proposal_revisions: join from proposals
CREATE INDEX IF NOT EXISTS idx_proposal_revisions_proposal_id
  ON proposal_revisions (proposal_id);

-- jobs: GCal sync-failure filter (gcal_event_id IS NULL + status + move_date)
CREATE INDEX IF NOT EXISTS idx_jobs_gcal_null_status
  ON jobs (status, move_date DESC)
  WHERE gcal_event_id IS NULL;
