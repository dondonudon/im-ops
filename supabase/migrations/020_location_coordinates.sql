ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pickup_lat float8,
  ADD COLUMN IF NOT EXISTS pickup_lng float8,
  ADD COLUMN IF NOT EXISTS destination_lat float8,
  ADD COLUMN IF NOT EXISTS destination_lng float8,
  ADD COLUMN IF NOT EXISTS destination_2_lat float8,
  ADD COLUMN IF NOT EXISTS destination_2_lng float8;
