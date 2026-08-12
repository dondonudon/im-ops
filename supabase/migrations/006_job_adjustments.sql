-- ============================================================
-- 006 — Job change-orders (derived job revenue)
-- ============================================================
-- jobs.revenue becomes DERIVED = base_revenue + Σ job_adjustments.amount, maintained
-- by triggers, so every existing reader of jobs.revenue is unaffected. Adjustments
-- capture mid-job scope changes (e.g. +1M overtime) auditably, without mutating the
-- base contracted amount. Supabase SQL Editor runs single-statement — run in order.

-- 1. base_revenue (backfill from current revenue, then lock down).
--    Also give revenue a DEFAULT so inserts may omit it — the BEFORE trigger (step 5)
--    derives it. Without a default, revenue stays a required insert column.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS base_revenue BIGINT;
UPDATE jobs SET base_revenue = revenue WHERE base_revenue IS NULL;
ALTER TABLE jobs ALTER COLUMN base_revenue SET DEFAULT 0;
ALTER TABLE jobs ALTER COLUMN base_revenue SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN revenue SET DEFAULT 0;

-- 2. job_adjustments (amount is SIGNED — no >0 check, unlike payments)
CREATE TABLE IF NOT EXISTS job_adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  amount      BIGINT NOT NULL,
  reason      TEXT NOT NULL,
  adjusted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_adjustments_job_id ON job_adjustments (job_id);

-- 3. RLS (same single-org authenticated policy as every table)
ALTER TABLE job_adjustments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='job_adjustments'
      AND policyname='authenticated_all_job_adjustments'
  ) THEN
    CREATE POLICY "authenticated_all_job_adjustments"
      ON job_adjustments FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. recompute jobs.revenue when adjustments change
CREATE OR REPLACE FUNCTION recompute_job_revenue()
RETURNS TRIGGER AS $$
DECLARE target UUID;
BEGIN
  target := COALESCE(NEW.job_id, OLD.job_id);
  UPDATE jobs j
  SET revenue = j.base_revenue
      + COALESCE((SELECT SUM(amount) FROM job_adjustments WHERE job_id = target), 0)
  WHERE j.id = target;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS after_job_adjustment_change ON job_adjustments;
CREATE TRIGGER after_job_adjustment_change
  AFTER INSERT OR UPDATE OR DELETE ON job_adjustments
  FOR EACH ROW EXECUTE FUNCTION recompute_job_revenue();

-- 5. derive revenue on job INSERT and on base_revenue change (BEFORE → sets NEW.revenue).
--    Fires only on base_revenue writes, so the adjustments trigger (which writes revenue
--    directly) does NOT re-fire this → no loop. On INSERT, NEW.id already has its DEFAULT.
CREATE OR REPLACE FUNCTION set_job_revenue_from_base()
RETURNS TRIGGER AS $$
BEGIN
  NEW.revenue := NEW.base_revenue
    + COALESCE((SELECT SUM(amount) FROM job_adjustments WHERE job_id = NEW.id), 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS before_job_set_revenue ON jobs;
CREATE TRIGGER before_job_set_revenue
  BEFORE INSERT OR UPDATE OF base_revenue ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_job_revenue_from_base();
