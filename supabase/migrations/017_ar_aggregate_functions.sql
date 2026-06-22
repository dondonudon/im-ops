-- PERF-03 / PERF-10: Server-side AR aggregates.
-- Replaces the client-side .limit(200) queries in today/page.tsx and
-- money/page.tsx that silently truncate totals beyond 200 invoices.
--
-- get_ar_totals()
--   Returns a single row with pre-computed totals and per-bucket aging amounts.
--   Used by both the Today page and the Money page for headline KPIs.
--
-- get_invoice_status_breakdown()
--   Returns one row per status with count + total_amount.
--   Used by money/page.tsx for the status breakdown card.

CREATE OR REPLACE FUNCTION get_ar_totals()
RETURNS TABLE(
  total_outstanding BIGINT,
  outstanding_count BIGINT,
  overdue_amount    BIGINT,
  overdue_count     BIGINT,
  aging_current     BIGINT,
  aging_1_30        BIGINT,
  aging_31_60       BIGINT,
  aging_60_plus     BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT
    COALESCE(SUM(outstanding) FILTER (WHERE outstanding > 0),                        0)::BIGINT AS total_outstanding,
    COUNT(*)                  FILTER (WHERE outstanding > 0)                                    AS outstanding_count,
    COALESCE(SUM(outstanding) FILTER (WHERE effective_status = 'overdue'),           0)::BIGINT AS overdue_amount,
    COUNT(*)                  FILTER (WHERE effective_status = 'overdue')                       AS overdue_count,
    -- Aging: current = not yet due or no due date
    COALESCE(SUM(outstanding) FILTER (
      WHERE outstanding > 0
        AND (due_date IS NULL OR due_date >= CURRENT_DATE)
    ), 0)::BIGINT AS aging_current,
    -- 1–30 days overdue
    COALESCE(SUM(outstanding) FILTER (
      WHERE outstanding > 0
        AND due_date < CURRENT_DATE
        AND due_date >= CURRENT_DATE - INTERVAL '30 days'
    ), 0)::BIGINT AS aging_1_30,
    -- 31–60 days overdue
    COALESCE(SUM(outstanding) FILTER (
      WHERE outstanding > 0
        AND due_date < CURRENT_DATE - INTERVAL '30 days'
        AND due_date >= CURRENT_DATE - INTERVAL '60 days'
    ), 0)::BIGINT AS aging_31_60,
    -- 60+ days overdue
    COALESCE(SUM(outstanding) FILTER (
      WHERE outstanding > 0
        AND due_date < CURRENT_DATE - INTERVAL '60 days'
    ), 0)::BIGINT AS aging_60_plus
  FROM invoice_outstanding
  WHERE effective_status != 'cancelled';
$$;

-- ---

CREATE OR REPLACE FUNCTION get_invoice_status_breakdown()
RETURNS TABLE(
  status       TEXT,
  inv_count    BIGINT,
  total_amount BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT
    CASE
      WHEN due_date < CURRENT_DATE AND status NOT IN ('paid', 'cancelled') THEN 'overdue'
      ELSE status
    END                    AS status,
    COUNT(*)               AS inv_count,
    SUM(total_amount)::BIGINT AS total_amount
  FROM invoices
  WHERE status != 'cancelled'
  GROUP BY 1;
$$;
