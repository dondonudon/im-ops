-- Add optional name prefix (salutation) to customers
ALTER TABLE customers
  ADD COLUMN prefix text CHECK (prefix IN ('Mr', 'Ms', 'Mrs', 'Tn', 'Ny', 'Nn'));
