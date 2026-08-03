-- IM Ops — SEO Reporting (Google Search Console)
-- Adds the Growth › SEO dashboard's storage: a property registry, business
-- target keywords, daily query metrics, and a sync-run log.
--
-- Scope note: the page↔query grain (seo_page_query_daily) and the device grain
-- (seo_device_query_daily) are intentionally NOT created here. They arrive with
-- the second implementation slice (trend chart + top pages + opportunities) so
-- the first release stays small. See docs/seo-dashboard-plan.md §13.
--
-- All statements are guarded (IF NOT EXISTS / ON CONFLICT / DROP POLICY IF
-- EXISTS) so re-running on an existing DB is safe. pgcrypto (gen_random_uuid)
-- is already enabled by 001.

-- ============================================================
-- TABLES
-- ============================================================

-- Registry of measured web properties. One row today (indo-mover.com); the
-- property_id FK on every other table avoids single-property assumptions later.
CREATE TABLE IF NOT EXISTS seo_properties (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_url     TEXT NOT NULL UNIQUE,          -- e.g. 'sc-domain:indo-mover.com'
  display_name TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keywords the business explicitly tracks. target_page is the page we *intend*
-- to rank; the dashboard compares it against the page GSC actually surfaces.
CREATE TABLE IF NOT EXISTS seo_target_keywords (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES seo_properties(id) ON DELETE CASCADE,
  keyword     TEXT NOT NULL,
  target_page TEXT,
  priority    SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5), -- 1 = highest
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, keyword)
);

-- Daily aggregate metrics per search query (GSC dimensions: date + query).
-- ctr is intentionally NOT stored: it is exactly clicks/impressions at this
-- grain, and all aggregates must be recomputed impression-weighted anyway.
CREATE TABLE IF NOT EXISTS seo_query_daily (
  property_id UUID NOT NULL REFERENCES seo_properties(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  query       TEXT NOT NULL,
  clicks      DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  position    DOUBLE PRECISION NOT NULL DEFAULT 0,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, metric_date, query)
);

CREATE INDEX IF NOT EXISTS seo_query_daily_date_idx
  ON seo_query_daily (property_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS seo_query_daily_query_idx
  ON seo_query_daily (property_id, query);

-- History and health of each synchronization run (scheduled cron, manual
-- refresh, or backfill). Powers the "last updated / data through" status card
-- and lets the sync service detect overlapping or stale runs.
CREATE TABLE IF NOT EXISTS seo_sync_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           UUID NOT NULL REFERENCES seo_properties(id) ON DELETE CASCADE,
  sync_type             TEXT NOT NULL CHECK (sync_type IN ('scheduled','manual','backfill')),
  status                TEXT NOT NULL CHECK (status IN ('running','success','partial','failed')),
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  query_rows_synced     INTEGER NOT NULL DEFAULT 0,
  page_query_rows_synced INTEGER NOT NULL DEFAULT 0,
  error_message         TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS seo_sync_runs_started_idx
  ON seo_sync_runs (property_id, started_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Config tables (properties, target keywords) follow the repo-wide
-- "authenticated gets full access" single-org convention — operators manage
-- these from the UI. Metric + sync-log tables are machine-written by the sync
-- service (service role, which bypasses RLS): authenticated users may READ them
-- but never write raw Search Console data from the browser.

ALTER TABLE seo_properties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_target_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_query_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_sync_runs       ENABLE ROW LEVEL SECURITY;

-- Config: full access for authenticated users.
DROP POLICY IF EXISTS "authenticated_all_seo_properties" ON seo_properties;
CREATE POLICY "authenticated_all_seo_properties"
  ON seo_properties FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "authenticated_all_seo_target_keywords" ON seo_target_keywords;
CREATE POLICY "authenticated_all_seo_target_keywords"
  ON seo_target_keywords FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

-- Metrics + sync log: read-only for authenticated; writes go through service role.
DROP POLICY IF EXISTS "authenticated_select_seo_query_daily" ON seo_query_daily;
CREATE POLICY "authenticated_select_seo_query_daily"
  ON seo_query_daily FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "authenticated_select_seo_sync_runs" ON seo_sync_runs;
CREATE POLICY "authenticated_select_seo_sync_runs"
  ON seo_sync_runs FOR SELECT TO authenticated
  USING (TRUE);

-- ============================================================
-- SEED — property + target keywords
-- ============================================================

INSERT INTO seo_properties (site_url, display_name)
VALUES ('sc-domain:indo-mover.com', 'Indo Mover')
ON CONFLICT (site_url) DO NOTHING;

INSERT INTO seo_target_keywords (property_id, keyword, target_page, priority)
SELECT p.id, seed.keyword, seed.target_page, seed.priority
FROM seo_properties p
CROSS JOIN (
  VALUES
    ('jasa pindah semarang',       '/',                             1),
    ('jasa pindahan semarang',     '/',                             1),
    ('jasa pindah rumah semarang', '/jasa-pindah-rumah-semarang/',  1),
    ('jasa pindah rumah',          '/jasa-pindah-rumah-semarang/',  2),
    ('jasa pindah',                '/',                             2)
) AS seed(keyword, target_page, priority)
WHERE p.site_url = 'sc-domain:indo-mover.com'
ON CONFLICT (property_id, keyword) DO NOTHING;
