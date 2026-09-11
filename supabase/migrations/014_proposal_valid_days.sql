-- ============================================================
-- 014 — proposal validity period setting
-- ============================================================
-- The proposal PDF prints "Penawaran ini berlaku hingga <date>", where the date
-- is the issue date + this many days. Seeded as an editable system_settings row
-- (category 'documents') so it surfaces in Settings → Company & Docs next to the
-- other proposal template fields. The PDF code falls back to 14 if the row is
-- absent, so applying this migration is optional but recommended.

INSERT INTO system_settings (key, value, category, description) VALUES
  ('proposal_valid_days', '14', 'documents', 'Number of days a proposal stays valid from its issue date')
ON CONFLICT (key) DO NOTHING;
