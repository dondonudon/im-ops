-- Migrate any existing draft invoices to sent (draft was never meaningful —
-- invoices are always sent externally via PDF download + email).
UPDATE invoices SET status = 'sent' WHERE status = 'draft';

-- Update DEFAULT and CHECK constraint to remove draft.
ALTER TABLE invoices
  ALTER COLUMN status SET DEFAULT 'sent';

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('sent', 'partially_paid', 'paid', 'overdue', 'cancelled'));
