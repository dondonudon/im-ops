-- Migration: 005_document_settings.sql
-- Add company identity and document template settings to system_settings.
-- These values are read by the PDF generation layer (ProposalPDF / InvoicePDF)
-- and are editable from the Settings page.

INSERT INTO system_settings (key, value, category, description) VALUES
  ('company_name',
   'IM Moving',
   'company',
   'Company name shown on proposals and invoices'),

  ('company_tagline',
   'Professional Relocation Services',
   'company',
   'Tagline shown below company name on all PDFs'),

  ('proposal_terms',
   E'1. This proposal is valid for 7 days from the date of issue.\n2. A down payment of 50% is required to confirm the booking.\n3. Remaining balance is due on the day of the move before unloading.\n4. Prices may be revised if the scope of work changes significantly.\n5. IM Moving is not liable for pre-existing damage to items.\n6. Cancellation less than 48 hours before the move date may incur a penalty.',
   'documents',
   'Terms & conditions text shown on proposals (edit freely — each line becomes a numbered term)'),

  ('proposal_signature_name',
   'IM Moving Operations',
   'documents',
   'Signatory name shown on the proposal signature block'),

  ('proposal_signature_role',
   'Authorized Signatory',
   'documents',
   'Signatory role/title shown on the proposal signature block'),

  ('invoice_footer_note',
   'Thank you for your business',
   'documents',
   'Footer note shown at the bottom of every invoice')

ON CONFLICT (key) DO NOTHING;
