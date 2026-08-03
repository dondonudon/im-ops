-- Add out-of-town crew cost defaults to system_settings so they are admin-configurable
-- alongside crew_day_rate and food_per_crew.

INSERT INTO system_settings (key, value, category, description)
VALUES
  ('travel_cost_per_crew', '1200000', 'crew', 'Day rate for origin crew who travel with the truck on out-of-town jobs (IDR)'),
  ('spot_hire_cost',       '100000',  'crew', 'Day rate per spot-hire helper at the destination on out-of-town jobs (IDR)')
ON CONFLICT (key) DO NOTHING;
