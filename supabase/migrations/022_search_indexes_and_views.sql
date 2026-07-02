-- PERF-05: Trigram indexes for columns used in ILIKE searches.
-- Extends migration 016 which already covered customers and jobs.

CREATE INDEX IF NOT EXISTS idx_leads_pickup_trgm
  ON leads USING GIN (pickup_address gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_destination_trgm
  ON leads USING GIN (destination_address gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_destination2_trgm
  ON leads USING GIN (destination_address_2 gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_notes_trgm
  ON leads USING GIN (notes gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_proposals_number_trgm
  ON proposals USING GIN (proposal_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_number_trgm
  ON invoices USING GIN (invoice_number gin_trgm_ops);

-- PERF-06: leads_with_customer view.
-- Collapses the 2-RTT leads search waterfall (customers → leads) into a single
-- query by exposing customer_name and customer_phone as flat columns.
-- security_invoker = true keeps RLS from the calling user's role.

CREATE OR REPLACE VIEW leads_with_customer
WITH (security_invoker = true) AS
SELECT
  l.*,
  c.name  AS customer_name,
  c.phone AS customer_phone
FROM leads l
LEFT JOIN customers c ON c.id = l.customer_id;

-- PERF-07: proposals_with_customer view.
-- Collapses the 3-RTT proposals search waterfall (customers → leads → proposals)
-- into a single query by exposing customer_name as a flat column.

CREATE OR REPLACE VIEW proposals_with_customer
WITH (security_invoker = true) AS
SELECT
  p.*,
  c.name AS customer_name
FROM proposals p
LEFT JOIN leads     l ON l.id  = p.lead_id
LEFT JOIN customers c ON c.id  = l.customer_id;
