-- ============================================================
-- 010 — Normalize lead addresses into a child table
-- ============================================================
-- Replaces the flat pickup/destination(/destination_2) columns on `leads` with a
-- `lead_addresses` child table so a lead can carry UNLIMITED pickups AND
-- destinations. Each stop is one row: role ('pickup' | 'destination'), seq
-- (order within the role), address + lat/lng.
--
-- Search: PostgREST cannot ilike across child rows inside an `.or(...)`, so we keep
-- a denormalized `leads.addresses_text` (GIN trgm indexed), maintained by a trigger
-- on `lead_addresses`. Both search sites (leads list, CommandPalette) filter that
-- single column. It's a derived cache — never write it directly.
--
-- The `leads_with_customer` view is `SELECT l.*`, so it must be dropped before the
-- old columns can go and recreated afterwards; it then exposes addresses_text
-- automatically. Run each statement in order.
--
-- Apply to Supabase BEFORE deploying the matching code (old columns are dropped).

-- 1. child table --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_addresses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('pickup','destination')),
  seq        INT  NOT NULL DEFAULT 0,
  address    TEXT,
  lat        FLOAT8,
  lng        FLOAT8,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_addresses_lead_id  ON lead_addresses (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_addresses_addr_trgm
  ON lead_addresses USING GIN (address gin_trgm_ops);

-- 2. RLS: single-org, any authenticated user gets full access (matches all tables)
ALTER TABLE lead_addresses ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'lead_addresses'
      AND policyname = 'authenticated_all_lead_addresses'
  ) THEN
    CREATE POLICY "authenticated_all_lead_addresses"
    ON lead_addresses FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. denormalized search cache on leads + its trgm index
ALTER TABLE leads ADD COLUMN IF NOT EXISTS addresses_text TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_addresses_text_trgm
  ON leads USING GIN (addresses_text gin_trgm_ops);

-- 4. keep addresses_text in sync with lead_addresses
CREATE OR REPLACE FUNCTION refresh_lead_addresses_text(p_lead_id UUID)
RETURNS void AS $$
BEGIN
  IF p_lead_id IS NULL THEN RETURN; END IF;
  UPDATE leads
  SET addresses_text = (
    SELECT string_agg(address, ' | ' ORDER BY role, seq)
    FROM lead_addresses
    WHERE lead_id = p_lead_id AND address IS NOT NULL AND address <> ''
  )
  WHERE id = p_lead_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION lead_addresses_sync_text()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_lead_addresses_text(OLD.lead_id);
    RETURN OLD;
  END IF;
  PERFORM refresh_lead_addresses_text(NEW.lead_id);
  IF TG_OP = 'UPDATE' AND NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
    PERFORM refresh_lead_addresses_text(OLD.lead_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_addresses_sync_text ON lead_addresses;
CREATE TRIGGER trg_lead_addresses_sync_text
AFTER INSERT OR UPDATE OR DELETE ON lead_addresses
FOR EACH ROW EXECUTE FUNCTION lead_addresses_sync_text();

-- 5. backfill child rows from the old flat columns
INSERT INTO lead_addresses (lead_id, role, seq, address, lat, lng)
SELECT id, 'pickup', 0, pickup_address, pickup_lat, pickup_lng
FROM leads WHERE pickup_address IS NOT NULL AND pickup_address <> '';

INSERT INTO lead_addresses (lead_id, role, seq, address, lat, lng)
SELECT id, 'destination', 0, destination_address, destination_lat, destination_lng
FROM leads WHERE destination_address IS NOT NULL AND destination_address <> '';

INSERT INTO lead_addresses (lead_id, role, seq, address, lat, lng)
SELECT id, 'destination', 1, destination_address_2, destination_2_lat, destination_2_lng
FROM leads WHERE destination_address_2 IS NOT NULL AND destination_address_2 <> '';

-- 6. backfill the search cache for every lead
UPDATE leads l SET addresses_text = (
  SELECT string_agg(a.address, ' | ' ORDER BY a.role, a.seq)
  FROM lead_addresses a
  WHERE a.lead_id = l.id AND a.address IS NOT NULL AND a.address <> ''
);

-- 7. drop the view that depends on the old columns (recreated in step 9)
DROP VIEW IF EXISTS leads_with_customer;

-- 8. drop the old flat columns + their trgm indexes
DROP INDEX IF EXISTS idx_leads_pickup_trgm;
DROP INDEX IF EXISTS idx_leads_destination_trgm;
DROP INDEX IF EXISTS idx_leads_destination2_trgm;

ALTER TABLE leads
  DROP COLUMN IF EXISTS pickup_address,
  DROP COLUMN IF EXISTS pickup_lat,
  DROP COLUMN IF EXISTS pickup_lng,
  DROP COLUMN IF EXISTS destination_address,
  DROP COLUMN IF EXISTS destination_lat,
  DROP COLUMN IF EXISTS destination_lng,
  DROP COLUMN IF EXISTS destination_address_2,
  DROP COLUMN IF EXISTS destination_2_lat,
  DROP COLUMN IF EXISTS destination_2_lng;

-- 9. recreate the view (now picks up addresses_text via l.*)
CREATE OR REPLACE VIEW leads_with_customer
WITH (security_invoker = true) AS
SELECT
  l.*,
  c.name  AS customer_name,
  c.phone AS customer_phone
FROM leads l
LEFT JOIN customers c ON c.id = l.customer_id;
