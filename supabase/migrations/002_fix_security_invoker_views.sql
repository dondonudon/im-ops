-- Fix Security Definer Views: recreate both views with security_invoker = true
-- so RLS policies on the underlying tables are enforced for the querying user.

CREATE OR REPLACE VIEW job_profit_summary
WITH (security_invoker = true)
AS
SELECT
  j.id AS job_id,
  j.job_number,
  j.revenue,
  j.status,
  COALESCE(SUM(e.amount), 0)::BIGINT AS actual_spend,
  (j.revenue - COALESCE(SUM(e.amount), 0))::BIGINT AS current_profit,
  COALESCE(i.paid_amount, 0)::BIGINT AS cash_received
FROM jobs j
LEFT JOIN expenses e ON e.job_id = j.id
LEFT JOIN invoices i ON i.job_id = j.id
GROUP BY j.id, i.paid_amount;

CREATE OR REPLACE VIEW invoice_outstanding
WITH (security_invoker = true)
AS
SELECT
  i.id,
  i.invoice_number,
  i.total_amount,
  i.paid_amount AS paid,
  (i.total_amount - i.paid_amount) AS outstanding,
  i.due_date,
  CASE
    WHEN i.due_date < CURRENT_DATE AND i.status NOT IN ('paid','cancelled') THEN 'overdue'
    ELSE i.status
  END AS effective_status
FROM invoices i;
