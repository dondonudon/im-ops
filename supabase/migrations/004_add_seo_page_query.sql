-- IM Ops — SEO page↔query grain (second slice)
-- Adds daily metrics for the (page, query) relationship, powering the top-pages
-- table, ranking-page mismatch, and cannibalization signals. Deferred from 003
-- to keep the first release small (docs/seo-dashboard-plan.md §13).
--
-- Guarded for safe re-runs. Machine-written by the sync service (service role);
-- authenticated users may read only.

CREATE TABLE IF NOT EXISTS seo_page_query_daily (
  property_id UUID NOT NULL REFERENCES seo_properties(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  page        TEXT NOT NULL,
  query       TEXT NOT NULL,
  clicks      DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  position    DOUBLE PRECISION NOT NULL DEFAULT 0,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, metric_date, page, query)
);

CREATE INDEX IF NOT EXISTS seo_page_query_daily_date_idx
  ON seo_page_query_daily (property_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS seo_page_query_daily_page_idx
  ON seo_page_query_daily (property_id, page);
CREATE INDEX IF NOT EXISTS seo_page_query_daily_query_idx
  ON seo_page_query_daily (property_id, query);

ALTER TABLE seo_page_query_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_seo_page_query_daily" ON seo_page_query_daily;
CREATE POLICY "authenticated_select_seo_page_query_daily"
  ON seo_page_query_daily FOR SELECT TO authenticated
  USING (TRUE);
