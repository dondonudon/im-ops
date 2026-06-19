ALTER TABLE proposals ADD COLUMN closed_at TIMESTAMPTZ;

UPDATE proposals SET closed_at = created_at WHERE status IN ('lost', 'expired');
