-- ============================================================
-- 002 — Performance indexes on hot date/filter columns
-- ============================================================
--
-- These columns are used in ORDER BY / range filters on the most-trafficked
-- pages (Pipeline, Leads, Money, Reports). Without indexes Postgres does a full
-- table scan + sort on every request. All are safe to create CONCURRENTLY on a
-- live database (no table lock), but Supabase SQL Editor runs single-statement
-- mode — run each statement individually if using the editor.

-- MEDIUM priority — hit on every page load
CREATE INDEX IF NOT EXISTS idx_payments_paid_at  ON payments (paid_at);
CREATE INDEX IF NOT EXISTS idx_leads_created_at  ON leads    (created_at DESC);

-- LOW priority — hit on list/report pages; add proactively before volume grows
CREATE INDEX IF NOT EXISTS idx_proposals_created_at  ON proposals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_closed_at   ON proposals (closed_at)
    WHERE closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_created_at  ON customers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date     ON invoices  (due_date)
    WHERE due_date IS NOT NULL;
