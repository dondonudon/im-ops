-- Signatures storage bucket, RLS policies, and verify function

-- Create bucket if not already done manually
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload new signature files
CREATE POLICY "authenticated_upload_signatures"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'signatures');

-- Authenticated users can replace existing signature files (upsert)
CREATE POLICY "authenticated_update_signatures"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'signatures');

-- Public read — needed for server-side PDF generation to fetch the image URL
CREATE POLICY "public_read_signatures"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'signatures');

-- SECURITY DEFINER function for the public /verify/[token] page.
-- Anon users can call this to look up a document by token without
-- direct RLS access to the underlying tables.
CREATE OR REPLACE FUNCTION public.verify_document_by_token(p_token UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company  text;
  v_prop_sig text;
  v_inv_sig  text;
  v_result   jsonb;
BEGIN
  SELECT
    MAX(CASE WHEN key = 'company_name'            THEN value END),
    MAX(CASE WHEN key = 'proposal_signature_name' THEN value END),
    MAX(CASE WHEN key = 'invoice_signature_name'  THEN value END)
  INTO v_company, v_prop_sig, v_inv_sig
  FROM system_settings
  WHERE key IN ('company_name', 'proposal_signature_name', 'invoice_signature_name');

  -- Proposal
  SELECT jsonb_build_object(
    'doc_type',       'Proposal',
    'doc_number',     p.proposal_number,
    'issued_at',      p.created_at,
    'signatory_name', COALESCE(v_prop_sig, ''),
    'company_name',   COALESCE(v_company, 'IM Operations')
  ) INTO v_result FROM proposals p WHERE p.verification_token = p_token;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  -- Invoice
  SELECT jsonb_build_object(
    'doc_type',       'Invoice',
    'doc_number',     i.invoice_number,
    'issued_at',      i.created_at,
    'signatory_name', COALESCE(v_inv_sig, ''),
    'company_name',   COALESCE(v_company, 'IM Operations')
  ) INTO v_result FROM invoices i WHERE i.verification_token = p_token;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  -- Payment / receipt
  SELECT jsonb_build_object(
    'doc_type',       'Kwitansi',
    'doc_number',     j.job_number,
    'issued_at',      pay.paid_at,
    'signatory_name', COALESCE(v_inv_sig, ''),
    'company_name',   COALESCE(v_company, 'IM Operations')
  ) INTO v_result
  FROM payments pay
  JOIN jobs j ON j.id = pay.job_id
  WHERE pay.verification_token = p_token;

  RETURN v_result; -- NULL when not found
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_document_by_token(UUID) TO anon;
