-- PERF-01: Trigram indexes for ILIKE text search on customers and jobs.
-- pg_trgm enables GIN-accelerated ILIKE '%...%' (infix) queries.
-- Without these, every customer/job search performs a full table scan.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Customer search: name and phone ILIKE filters (used in customers/page.tsx,
-- CommandPalette, and the server action duplicate check).
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
  ON customers USING GIN (phone gin_trgm_ops);

-- Job search: job_number ILIKE filter (used in jobs/page.tsx list view).
CREATE INDEX IF NOT EXISTS idx_jobs_job_number_trgm
  ON jobs USING GIN (job_number gin_trgm_ops);
