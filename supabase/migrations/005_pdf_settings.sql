-- Update company identity settings with Indo Mover branding
UPDATE system_settings SET
  value       = 'Indo Mover',
  description = 'Company name shown on proposals and invoices'
WHERE key = 'company_name';

UPDATE system_settings SET
  value       = 'TRUCKING | MOVING | COURIER DOMESTIK & INTERNATIONAL',
  description = 'Tagline shown below the logo on all PDFs'
WHERE key = 'company_tagline';

-- New company identity settings
INSERT INTO system_settings (key, value, category, description) VALUES
  ('company_logo_url',  'https://indo-mover.com/images/indo-mover-logo-only.png', 'company', 'Logo image URL shown at the top of every PDF'),
  ('company_address',   'Jl. M.T. Haryono Gg. Utri 64 Semarang',                 'company', 'Company address shown in the PDF header'),
  ('company_phone',     '+62 8515 600 9251',                                       'company', 'Phone number shown in the PDF header'),
  ('company_website',   'https://www.indo-mover.com',                              'company', 'Website URL shown in the PDF footer'),
  ('company_city',      'Semarang',                                                'company', 'City name used in the document date line (e.g. "Semarang, 1 Juni 2026")')
ON CONFLICT (key) DO NOTHING;

-- Proposal document settings (replaces proposal_terms)
INSERT INTO system_settings (key, value, category, description) VALUES
  ('proposal_included_services', E'Packing\nLoading\nRelokasi', 'documents', 'Included services listed in the proposal body — one service per line'),
  ('proposal_signature_name',    'Prasetyo Eko Alvianto',        'documents', 'Name shown on the proposal signature block')
ON CONFLICT (key) DO UPDATE SET
  value       = EXCLUDED.value,
  description = EXCLUDED.description;

UPDATE system_settings SET
  value       = 'Kepala Cabang',
  description = 'Role/title shown on the proposal signature block'
WHERE key = 'proposal_signature_role';

-- Invoice document settings (replaces invoice_footer_note)
INSERT INTO system_settings (key, value, category, description) VALUES
  ('invoice_bank_name',           'BANK BRI',                 'invoice', 'Bank name for payment transfer instructions on invoices'),
  ('invoice_bank_account_number', '089801008338503',           'invoice', 'Bank account number for payment transfer instructions'),
  ('invoice_bank_account_holder', 'Prasetyo Eko Alvianto',    'invoice', 'Account holder name for payment transfer instructions'),
  ('invoice_signature_name',      'Prasetyo Eko Alvianto',    'invoice', 'Name shown on the invoice signature block'),
  ('invoice_signature_role',      'Kepala Cabang',             'invoice', 'Role/title shown on the invoice signature block (shown in parentheses)')
ON CONFLICT (key) DO NOTHING;

-- Remove obsolete settings no longer used by the PDF templates
DELETE FROM system_settings WHERE key IN ('proposal_terms', 'invoice_footer_note');
