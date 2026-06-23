-- Per-month revenue targets, independent of each other.
-- Replaces the single system_settings key "revenue_target_monthly" for
-- month-specific lookups; that key is retained as a global fallback default.

CREATE TABLE IF NOT EXISTS revenue_targets (
  year          INT  NOT NULL,
  month         INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_amount BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  updated_by    UUID REFERENCES auth.users(id),
  PRIMARY KEY (year, month)
);

ALTER TABLE revenue_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_revenue_targets"
  ON revenue_targets
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
