-- Migration: seed revenue_target_monthly into system_settings
-- This value is displayed and tracked on the Operations Dashboard.
-- Edit it via Settings → dashboard category.

INSERT INTO system_settings (key, value, category, description)
VALUES (
  'revenue_target_monthly',
  '50000000',
  'dashboard',
  'Monthly revenue target shown on the dashboard (IDR). Edit this value to change the goal bar.'
)
ON CONFLICT (key) DO NOTHING;
