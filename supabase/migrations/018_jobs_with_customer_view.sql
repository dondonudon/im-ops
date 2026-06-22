-- PERF-04: jobs_with_customer view.
-- Eliminates the 4 sequential DB round-trips in jobs/page.tsx when searching
-- by customer name. A single .ilike("customer_name", ...) replaces the chain:
--   customers → leads → proposals → jobs.
--
-- security_invoker = true ensures RLS from the calling user's role applies,
-- so the view is as safe as querying the base tables directly.

CREATE OR REPLACE VIEW jobs_with_customer
WITH (security_invoker = true) AS
SELECT
  j.id,
  j.job_number,
  j.status,
  j.move_date,
  j.move_time,
  j.move_end_date,
  j.revenue,
  j.proposal_id,
  c.name AS customer_name
FROM jobs j
JOIN proposals pr ON pr.id = j.proposal_id
JOIN leads     l  ON l.id  = pr.lead_id
JOIN customers c  ON c.id  = l.customer_id;
