-- Update company identity settings with Indo Mover branding
UPDATE system_settings SET
  value       = '',
  description = 'Company name shown on proposals and invoices'
WHERE key = 'company_name';

UPDATE system_settings SET
  value       = '',
  description = 'Tagline shown below the logo on all PDFs'
WHERE key = 'company_tagline';

-- New company identity settings
INSERT INTO system_settings (key, value, category, description) VALUES
  ('company_logo_url',  '', 'company', 'Logo image URL shown at the top of every PDF'),
  ('company_address',   '', 'company', 'Company address shown in the PDF header'),
  ('company_phone',     '', 'company', 'Phone number shown in the PDF header'),
  ('company_website',   '', 'company', 'Website URL shown in the PDF footer'),
  ('company_city',      '', 'company', 'City name used in the document date line (e.g. "Semarang, 1 Juni 2026")')
ON CONFLICT (key) DO NOTHING;

-- Proposal document settings (replaces proposal_terms)
INSERT INTO system_settings (key, value, category, description) VALUES
  ('proposal_included_services', '', 'documents', 'Included services listed in the proposal body — one service per line'),
  ('proposal_signature_name',    '', 'documents', 'Name shown on the proposal signature block')
ON CONFLICT (key) DO UPDATE SET
  value       = EXCLUDED.value,
  description = EXCLUDED.description;

UPDATE system_settings SET
  value       = '',
  description = 'Role/title shown on the proposal signature block'
WHERE key = 'proposal_signature_role';

-- Invoice document settings (replaces invoice_footer_note)
INSERT INTO system_settings (key, value, category, description) VALUES
  ('invoice_bank_name',           '', 'invoice', 'Bank name for payment transfer instructions on invoices'),
  ('invoice_bank_account_number', '', 'invoice', 'Bank account number for payment transfer instructions'),
  ('invoice_bank_account_holder', '', 'invoice', 'Account holder name for payment transfer instructions'),
  ('invoice_signature_name',      '', 'invoice', 'Name shown on the invoice signature block'),
  ('invoice_signature_role',      '', 'invoice', 'Role/title shown on the invoice signature block (shown in parentheses)')
ON CONFLICT (key) DO NOTHING;

-- Remove obsolete settings no longer used by the PDF templates
DELETE FROM system_settings WHERE key IN ('proposal_terms', 'invoice_footer_note');
