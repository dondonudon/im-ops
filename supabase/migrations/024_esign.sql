-- E-sign: verification tokens + signature image settings

-- Add verification_token to proposals
ALTER TABLE proposals
  ADD COLUMN verification_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX idx_proposals_verification_token ON proposals(verification_token);

-- Add verification_token to invoices
ALTER TABLE invoices
  ADD COLUMN verification_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX idx_invoices_verification_token ON invoices(verification_token);

-- Add verification_token to payments
ALTER TABLE payments
  ADD COLUMN verification_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX idx_payments_verification_token ON payments(verification_token);

-- New system_settings keys for signature images
-- Receipt reuses invoice_signature_image_url (mirrors existing name/role pattern)
INSERT INTO system_settings (key, value, category, description) VALUES
  ('proposal_signature_image_url', '', 'documents', 'Signature image shown on proposal PDFs'),
  ('invoice_signature_image_url',  '', 'invoice',   'Signature image shown on invoice and receipt PDFs')
ON CONFLICT (key) DO NOTHING;
