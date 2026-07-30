-- IM Ops — Full Database Schema (consolidated from migrations 001–026)
-- Run on a fresh Supabase project to reproduce the complete schema.
-- All statements are guarded (IF NOT EXISTS / OR REPLACE / ON CONFLICT) for idempotency.

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  type         TEXT DEFAULT 'individual' CHECK (type IN ('individual','corporate')),
  company_name TEXT,
  notes        TEXT,
  address      TEXT,
  prefix       TEXT CHECK (prefix IN ('Mr', 'Ms', 'Mrs', 'Tn', 'Ny', 'Nn')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           UUID REFERENCES customers(id) ON DELETE RESTRICT,
  pickup_address        TEXT,
  destination_address   TEXT,
  destination_address_2 TEXT,
  preferred_date        DATE,
  lead_type             TEXT CHECK (lead_type IN ('whatsapp','onsite','returning','corporate')),
  origin_channel        TEXT CHECK (origin_channel IN ('whatsapp','call','referral','walkin')),
  status                TEXT DEFAULT 'new' CHECK (status IN (
                          'new','survey_scheduled','survey_done','estimating',
                          'proposal_sent','converted','closed_lost'
                        )),
  notes                 TEXT,
  pickup_lat            FLOAT8,
  pickup_lng            FLOAT8,
  destination_lat       FLOAT8,
  destination_lng       FLOAT8,
  destination_2_lat     FLOAT8,
  destination_2_lng     FLOAT8,
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID REFERENCES leads(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption      TEXT,
  uploaded_by  UUID REFERENCES auth.users(id),
  uploaded_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS surveys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID REFERENCES leads(id) ON DELETE RESTRICT UNIQUE,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  conducted_at  TIMESTAMPTZ,
  surveyor_id   UUID REFERENCES auth.users(id),
  access_notes  TEXT,
  special_items JSONB DEFAULT '[]',
  notes         TEXT,
  gcal_event_id TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    UUID REFERENCES surveys(id) ON DELETE CASCADE,
  media_type   TEXT CHECK (media_type IN ('photo','video')),
  storage_path TEXT NOT NULL,
  caption      TEXT,
  uploaded_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            UUID REFERENCES leads(id) ON DELETE RESTRICT,
  proposal_number    TEXT UNIQUE NOT NULL,
  service_type       TEXT DEFAULT 'DOM',
  status             TEXT DEFAULT 'draft' CHECK (status IN (
                       'draft','sent','negotiating','approved','lost','expired'
                     )),
  final_price        BIGINT,
  closed_reason      TEXT,
  approved_at        TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,
  pdf_url            TEXT,
  custom_fields      JSONB DEFAULT NULL,
  verification_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposals_verification_token ON proposals(verification_token);

CREATE TABLE IF NOT EXISTS estimations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID REFERENCES proposals(id) ON DELETE CASCADE UNIQUE,
  engine_version    TEXT NOT NULL,
  inputs            JSONB NOT NULL,
  settings_snapshot JSONB NOT NULL,
  outputs           JSONB NOT NULL,
  overrides         JSONB,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposal_revisions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id    UUID REFERENCES proposals(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  price          BIGINT NOT NULL,
  changed_by     TEXT NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID REFERENCES proposals(id) ON DELETE RESTRICT UNIQUE,
  job_number    TEXT UNIQUE NOT NULL,
  status        TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
  move_date     DATE NOT NULL,
  move_time     TIME,
  move_end_date DATE,
  move_end_time TIME,
  revenue       BIGINT NOT NULL,
  gcal_event_id TEXT,
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  phone            TEXT,
  contact_person   TEXT,
  vehicle_types    TEXT[] DEFAULT '{}',
  service_areas    TEXT[] DEFAULT '{}',
  rate_assumptions JSONB DEFAULT '{}',
  bank_name        TEXT,
  bank_account     TEXT,
  notes            TEXT,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crew (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  phone               TEXT,
  skills              TEXT[] DEFAULT '{}',
  daily_rate          BIGINT,
  availability_status TEXT DEFAULT 'available',
  emergency_contact   TEXT,
  notes               TEXT,
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('fleet', 'crew')),
  fleet_id        UUID REFERENCES fleet(id) ON DELETE SET NULL,
  crew_id         UUID REFERENCES crew(id) ON DELETE SET NULL,
  role            TEXT,
  daily_rate      BIGINT,
  days            INTEGER DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES jobs(id) ON DELETE RESTRICT,
  amount      BIGINT NOT NULL CHECK (amount > 0),
  category    TEXT NOT NULL,
  description TEXT,
  receipt_url TEXT,
  incurred_at DATE NOT NULL DEFAULT CURRENT_DATE,
  logged_by   UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             UUID REFERENCES jobs(id) ON DELETE RESTRICT UNIQUE,
  invoice_number     TEXT UNIQUE NOT NULL,
  total_amount       BIGINT NOT NULL,
  paid_amount        BIGINT NOT NULL DEFAULT 0,
  status             TEXT DEFAULT 'sent' CHECK (status IN (
                       'sent','partially_paid','paid','overdue','cancelled'
                     )),
  due_date           DATE,
  notes              TEXT,
  pdf_url            TEXT,
  verification_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_verification_token ON invoices(verification_token);

CREATE TABLE IF NOT EXISTS payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  amount             BIGINT NOT NULL CHECK (amount > 0),
  payment_type       TEXT NOT NULL CHECK (payment_type IN ('down_payment','partial','final','refund')),
  method             TEXT CHECK (method IN ('cash','transfer')),
  paid_at            DATE NOT NULL DEFAULT CURRENT_DATE,
  notes              TEXT,
  verification_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_verification_token ON payments(verification_token);

CREATE TABLE IF NOT EXISTS job_timeline (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES jobs(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  event_type  TEXT NOT NULL,
  notes       TEXT,
  logged_by   UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  category    TEXT,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS job_media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  media_type   TEXT NOT NULL CHECK (media_type IN ('photo', 'pdf')),
  storage_path TEXT NOT NULL,
  file_name    TEXT,
  caption      TEXT,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenue_targets (
  year          INT NOT NULL,
  month         INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_amount BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  updated_by    UUID REFERENCES auth.users(id),
  PRIMARY KEY (year, month)
);

-- ============================================================
-- VIEWS
-- invoice_outstanding must come before get_ar_totals (LANGUAGE sql validates refs)
-- ============================================================

CREATE OR REPLACE VIEW job_profit_summary
WITH (security_invoker = true) AS
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
WITH (security_invoker = true) AS
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

CREATE OR REPLACE VIEW leads_with_customer
WITH (security_invoker = true) AS
SELECT
  l.*,
  c.name  AS customer_name,
  c.phone AS customer_phone
FROM leads l
LEFT JOIN customers c ON c.id = l.customer_id;

CREATE OR REPLACE VIEW proposals_with_customer
WITH (security_invoker = true) AS
SELECT
  p.*,
  c.name AS customer_name
FROM proposals p
LEFT JOIN leads     l ON l.id  = p.lead_id
LEFT JOIN customers c ON c.id  = l.customer_id;

CREATE OR REPLACE VIEW job_outstanding
WITH (security_invoker = true) AS
SELECT
  j.id,
  j.job_number,
  j.move_date,
  j.revenue,
  c.name AS customer_name,
  COALESCE(pay.paid, 0)::BIGINT AS paid,
  (j.revenue - COALESCE(pay.paid, 0))::BIGINT AS outstanding,
  (COALESCE(pay.paid, 0) > 0) AS partial,
  COALESCE(
    i.due_date < CURRENT_DATE AND i.status NOT IN ('paid', 'cancelled'),
    false
  ) AS invoice_overdue
FROM jobs j
LEFT JOIN proposals pr ON pr.id = j.proposal_id
LEFT JOIN leads     l  ON l.id  = pr.lead_id
LEFT JOIN customers c  ON c.id  = l.customer_id
LEFT JOIN invoices  i  ON i.job_id = j.id
LEFT JOIN LATERAL (
  SELECT SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount ELSE p.amount END) AS paid
  FROM payments p
  WHERE p.job_id = j.id
) pay ON true
WHERE j.status = 'scheduled'
  AND (j.revenue - COALESCE(pay.paid, 0)) > 0;

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION generate_proposal_number(service_type TEXT DEFAULT 'DOM')
RETURNS TEXT AS $$
DECLARE
  seq          INTEGER;
  month_roman  TEXT;
  year_val     TEXT;
  roman_months TEXT[] := ARRAY['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(proposal_number, '/', 1) AS INTEGER)
  ), 0) + 1
  INTO seq
  FROM proposals
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now());

  month_roman := roman_months[EXTRACT(MONTH FROM now())];
  year_val    := TO_CHAR(now(), 'YYYY');

  RETURN seq || '/' || service_type || '-IM/' || month_roman || '/' || year_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TEXT AS $$
DECLARE
  seq      INTEGER;
  year_val TEXT;
BEGIN
  LOCK TABLE jobs IN SHARE ROW EXCLUSIVE MODE;

  SELECT COALESCE(
    MAX(CAST(SPLIT_PART(job_number, '-', 3) AS INTEGER)),
    0
  ) + 1
  INTO seq
  FROM jobs
  WHERE job_number LIKE 'JOB-' || TO_CHAR(now(), 'YYYY') || '-%'
    AND job_number ~ '^JOB-\d{4}-\d+$';

  year_val := TO_CHAR(now(), 'YYYY');
  RETURN 'JOB-' || year_val || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  seq          INTEGER;
  month_roman  TEXT;
  year_val     TEXT;
  month_start  TIMESTAMPTZ;
  month_end    TIMESTAMPTZ;
  roman_months TEXT[] := ARRAY['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
BEGIN
  LOCK TABLE invoices IN SHARE ROW EXCLUSIVE MODE;

  month_start := DATE_TRUNC('month', now());
  month_end   := month_start + INTERVAL '1 month';

  SELECT COALESCE(COUNT(*), 0) + 1
  INTO seq
  FROM invoices
  WHERE created_at >= month_start AND created_at < month_end;

  month_roman := roman_months[EXTRACT(MONTH FROM now())];
  year_val    := TO_CHAR(now(), 'YYYY');

  RETURN 'INV/' || year_val || '/' || month_roman || '/' || LPAD(seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION check_resource_overlap(
  p_type TEXT,
  p_id   UUID,
  p_date DATE
)
RETURNS TABLE(job_id UUID, job_number TEXT, move_date DATE) AS $$
BEGIN
  RETURN QUERY
  SELECT j.id, j.job_number, j.move_date
  FROM job_assignments ja
  JOIN jobs j ON j.id = ja.job_id
  WHERE ja.assignment_type = p_type
    AND (
      (p_type = 'fleet' AND ja.fleet_id = p_id)
      OR
      (p_type = 'crew'  AND ja.crew_id  = p_id)
    )
    AND j.move_date = p_date
    AND j.status != 'cancelled';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION update_invoice_status()
RETURNS TRIGGER AS $$
DECLARE
  total_paid    BIGINT;
  invoice_total BIGINT;
  target_job_id UUID;
BEGIN
  target_job_id := COALESCE(NEW.job_id, OLD.job_id);

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_type != 'refund'), 0)
    - COALESCE(SUM(amount) FILTER (WHERE payment_type = 'refund'), 0)
  INTO total_paid
  FROM payments
  WHERE job_id = target_job_id;

  SELECT total_amount INTO invoice_total
  FROM invoices WHERE job_id = target_job_id;

  IF invoice_total IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE invoices
  SET paid_amount = total_paid,
      status = CASE
        WHEN total_paid >= invoice_total THEN 'paid'
        WHEN total_paid > 0              THEN 'partially_paid'
        ELSE 'sent'
      END
  WHERE job_id = target_job_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION close_draft_proposals_on_lead_lost()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'closed_lost' AND OLD.status IS DISTINCT FROM 'closed_lost' THEN
    UPDATE proposals
    SET
      status        = 'lost',
      closed_at     = NOW(),
      closed_reason = 'Lead closed as lost'
    WHERE lead_id = NEW.id
      AND status IN ('draft', 'sent', 'negotiating');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Depends on invoice_outstanding view — must come after it
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
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT
    COALESCE(SUM(outstanding) FILTER (WHERE outstanding > 0),                        0)::BIGINT,
    COUNT(*)                  FILTER (WHERE outstanding > 0),
    COALESCE(SUM(outstanding) FILTER (WHERE effective_status = 'overdue'),           0)::BIGINT,
    COUNT(*)                  FILTER (WHERE effective_status = 'overdue'),
    COALESCE(SUM(outstanding) FILTER (
      WHERE outstanding > 0 AND (due_date IS NULL OR due_date >= CURRENT_DATE)
    ), 0)::BIGINT,
    COALESCE(SUM(outstanding) FILTER (
      WHERE outstanding > 0
        AND due_date < CURRENT_DATE
        AND due_date >= CURRENT_DATE - INTERVAL '30 days'
    ), 0)::BIGINT,
    COALESCE(SUM(outstanding) FILTER (
      WHERE outstanding > 0
        AND due_date < CURRENT_DATE - INTERVAL '30 days'
        AND due_date >= CURRENT_DATE - INTERVAL '60 days'
    ), 0)::BIGINT,
    COALESCE(SUM(outstanding) FILTER (
      WHERE outstanding > 0 AND due_date < CURRENT_DATE - INTERVAL '60 days'
    ), 0)::BIGINT
  FROM invoice_outstanding
  WHERE effective_status != 'cancelled';
$$;

CREATE OR REPLACE FUNCTION get_invoice_status_breakdown()
RETURNS TABLE(
  status       TEXT,
  inv_count    BIGINT,
  total_amount BIGINT
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT
    CASE
      WHEN due_date < CURRENT_DATE AND status NOT IN ('paid', 'cancelled') THEN 'overdue'
      ELSE status
    END                       AS status,
    COUNT(*)                  AS inv_count,
    SUM(total_amount)::BIGINT AS total_amount
  FROM invoices
  WHERE status != 'cancelled'
  GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION public.verify_document_by_token(p_token UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company  text;
  v_prop_sig text;
  v_inv_sig  text;
  v_result   jsonb;
BEGIN
  SELECT
    MAX(CASE WHEN key = 'company_name'            THEN value END),
    MAX(CASE WHEN key = 'proposal_signature_name' THEN value END),
    MAX(CASE WHEN key = 'invoice_signature_name'  THEN value END)
  INTO v_company, v_prop_sig, v_inv_sig
  FROM system_settings
  WHERE key IN ('company_name', 'proposal_signature_name', 'invoice_signature_name');

  SELECT jsonb_build_object(
    'doc_type',       'Proposal',
    'doc_number',     p.proposal_number,
    'issued_at',      p.created_at,
    'signatory_name', COALESCE(v_prop_sig, ''),
    'company_name',   COALESCE(v_company, 'IM Operations')
  ) INTO v_result FROM proposals p WHERE p.verification_token = p_token;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  SELECT jsonb_build_object(
    'doc_type',       'Invoice',
    'doc_number',     i.invoice_number,
    'issued_at',      i.created_at,
    'signatory_name', COALESCE(v_inv_sig, ''),
    'company_name',   COALESCE(v_company, 'IM Operations')
  ) INTO v_result FROM invoices i WHERE i.verification_token = p_token;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  SELECT jsonb_build_object(
    'doc_type',       'Kwitansi',
    'doc_number',     j.job_number,
    'issued_at',      pay.paid_at,
    'signatory_name', COALESCE(v_inv_sig, ''),
    'company_name',   COALESCE(v_company, 'IM Operations')
  ) INTO v_result
  FROM payments pay
  JOIN jobs j ON j.id = pay.job_id
  WHERE pay.verification_token = p_token;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_document_by_token(UUID) TO anon;

-- ============================================================
-- TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS after_payment_insert ON payments;
CREATE TRIGGER after_payment_insert
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_invoice_status();

DROP TRIGGER IF EXISTS trg_close_proposals_on_lead_lost ON leads;
CREATE TRIGGER trg_close_proposals_on_lead_lost
  AFTER UPDATE OF status ON leads
  FOR EACH ROW EXECUTE FUNCTION close_draft_proposals_on_lead_lost();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE customers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_photos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_media       ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet              ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew               ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_timeline       ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_media          ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_targets    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl    TEXT;
  tables TEXT[] := ARRAY[
    'customers','leads','lead_photos','surveys','survey_media',
    'proposals','estimations','proposal_revisions','jobs',
    'fleet','crew','job_assignments','expenses','payments',
    'invoices','job_timeline','system_settings','job_media','revenue_targets'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = tbl
        AND policyname = 'authenticated_all_' || tbl
    ) THEN
      EXECUTE format('
        CREATE POLICY "authenticated_all_%s"
        ON %I FOR ALL TO authenticated
        USING (true) WITH CHECK (true)
      ', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- SYSTEM SETTINGS SEED
-- ============================================================

INSERT INTO system_settings (key, value, category, description) VALUES
  ('crew_day_rate',                '175000',    'crew',      'Default crew cost per person per day (IDR)'),
  ('food_per_crew',                '35000',     'crew',      'Default food allowance per crew member (IDR)'),
  ('default_margin_pct',           '30',        'pricing',   'Default margin percentage (used as fallback; tiered margin auto-applies)'),
  ('negotiation_buffer_pct',       '3',         'pricing',   'Fixed negotiation buffer added to internal target price'),
  ('operational_buffer_pct',       '10',        'pricing',   'Operational buffer added to raw job cost'),
  ('margin_tiers',                 '[{"max":1000000,"rate_pct":45,"min_profit":300000},{"max":3000000,"rate_pct":35,"min_profit":500000},{"max":7000000,"rate_pct":25,"min_profit":750000},{"max":15000000,"rate_pct":20,"min_profit":1300000},{"max":null,"rate_pct":15,"min_profit":2100000}]',
                                               'pricing',   'Tiered margin table: margin rate and minimum profit by adjusted-cost bracket'),
  ('price_round_increment',        '50000',     'pricing',   'Round prices up to the nearest this many IDR'),
  ('vehicle_rate_pickup',          '500000',    'vehicle',   'Pickup truck daily rate (IDR)'),
  ('vehicle_rate_box_truck',       '800000',    'vehicle',   'Box truck daily rate (IDR)'),
  ('min_target_profit',            '500000',    'safety',    'Minimum acceptable profit per job (IDR)'),
  ('invoice_due_days',             '7',         'invoice',   'Default invoice due days after issue'),
  ('gcal_calendar_id',             '',          'gcal',      'Google Calendar ID for event sync (leave blank to disable)'),
  ('revenue_target_monthly',       '50000000',  'dashboard', 'Monthly revenue target shown on the dashboard (IDR). Edit this value to change the goal bar.'),
  ('company_name',                 '',          'company',   'Company name shown on proposals and invoices'),
  ('company_tagline',              '',          'company',   'Tagline shown below the logo on all PDFs'),
  ('company_logo_url',             '',          'company',   'Logo image URL shown at the top of every PDF'),
  ('company_address',              '',          'company',   'Company address shown in the PDF header'),
  ('company_phone',                '',          'company',   'Phone number shown in the PDF header'),
  ('company_website',              '',          'company',   'Website URL shown in the PDF footer'),
  ('company_city',                 '',          'company',   'City name used in the document date line (e.g. "Semarang, 1 Juni 2026")'),
  ('proposal_included_services',   '',          'documents', 'Included services listed in the proposal body — one service per line'),
  ('proposal_signature_name',      '',          'documents', 'Name shown on the proposal signature block'),
  ('proposal_signature_role',      '',          'documents', 'Role/title shown on the proposal signature block'),
  ('proposal_signature_image_url', '',          'documents', 'Signature image shown on proposal PDFs'),
  ('invoice_bank_name',            '',          'invoice',   'Bank name for payment transfer instructions on invoices'),
  ('invoice_bank_account_number',  '',          'invoice',   'Bank account number for payment transfer instructions'),
  ('invoice_bank_account_holder',  '',          'invoice',   'Account holder name for payment transfer instructions'),
  ('invoice_signature_name',       '',          'invoice',   'Name shown on the invoice signature block'),
  ('invoice_signature_role',       '',          'invoice',   'Role/title shown on the invoice signature block (shown in parentheses)'),
  ('invoice_signature_image_url',  '',          'invoice',   'Signature image shown on invoice and receipt PDFs')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- INDEXES
-- ============================================================

-- jobs
CREATE INDEX IF NOT EXISTS idx_jobs_status           ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_move_date        ON jobs (move_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_move_date ON jobs (status, move_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_gcal_null_status ON jobs (status, move_date DESC) WHERE gcal_event_id IS NULL;

-- job_assignments
CREATE INDEX IF NOT EXISTS idx_job_assignments_job_id ON job_assignments (job_id);

-- expenses
CREATE INDEX IF NOT EXISTS idx_expenses_job_id      ON expenses (job_id);
CREATE INDEX IF NOT EXISTS idx_expenses_incurred_at ON expenses (incurred_at);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_job_id ON payments (job_id);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON invoices (job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);

-- job_timeline
CREATE INDEX IF NOT EXISTS idx_job_timeline_job_id ON job_timeline (job_id);

-- proposals
CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON proposals (lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status  ON proposals (status);

-- leads
CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads (customer_id);

-- lead_photos
CREATE INDEX IF NOT EXISTS idx_lead_photos_lead_id ON lead_photos (lead_id);

-- surveys
CREATE INDEX IF NOT EXISTS idx_surveys_lead_id ON surveys (lead_id);

-- survey_media
CREATE INDEX IF NOT EXISTS idx_survey_media_survey_id ON survey_media (survey_id);

-- proposal_revisions
CREATE INDEX IF NOT EXISTS idx_proposal_revisions_proposal_id ON proposal_revisions (proposal_id);

-- job_media
CREATE INDEX IF NOT EXISTS idx_job_media_job_id ON job_media (job_id);

-- trigram indexes
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm      ON customers USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm     ON customers USING GIN (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_job_number_trgm     ON jobs      USING GIN (job_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_pickup_trgm        ON leads     USING GIN (pickup_address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_destination_trgm   ON leads     USING GIN (destination_address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_destination2_trgm  ON leads     USING GIN (destination_address_2 gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_notes_trgm         ON leads     USING GIN (notes gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_proposals_number_trgm    ON proposals USING GIN (proposal_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_number_trgm     ON invoices  USING GIN (invoice_number gin_trgm_ops);

-- ============================================================
-- STORAGE BUCKETS + POLICIES
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES
  ('lead-photos',  'lead-photos',  true),
  ('survey-media', 'survey-media', true),
  ('invoices',     'invoices',     false),
  ('proposals',    'proposals',    false),
  ('job-media',    'job-media',    true),
  ('receipts',     'receipts',     true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$
DECLARE
  bucket  TEXT;
  buckets TEXT[] := ARRAY['lead-photos','survey-media','invoices','proposals','job-media','receipts'];
BEGIN
  FOREACH bucket IN ARRAY buckets LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'authenticated_select_' || bucket
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_select_%s" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L)',
        bucket, bucket
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'authenticated_insert_' || bucket
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_insert_%s" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)',
        bucket, bucket
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'authenticated_update_' || bucket
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_update_%s" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L)',
        bucket, bucket
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'authenticated_delete_' || bucket
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_delete_%s" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L)',
        bucket, bucket
      );
    END IF;
  END LOOP;
END $$;

