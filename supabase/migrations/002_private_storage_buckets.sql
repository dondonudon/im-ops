-- ============================================================
-- 002 — Make PII / financial storage buckets PRIVATE
-- ============================================================
--
-- Buckets created in 001 as `public = true` are served by Supabase over the
-- unauthenticated `/storage/v1/object/public/<bucket>/<path>` path, which
-- bypasses RLS entirely — the `authenticated_select_*` policies never run for a
-- public bucket. That exposes customer PII (lead/survey home photos, job media)
-- and financial documents (receipts) to anyone who learns an object path.
--
-- This migration flips them to private. Reads now go through short-TTL signed
-- URLs (createSignedUrl) in the app, and the existing authenticated_* RLS
-- policies from 001 govern access. `invoices` and `proposals` were already
-- private and are left unchanged.
--
-- Idempotent + safe to re-run. Applying this to an existing project updates the
-- live buckets in place; no object paths change.

UPDATE storage.buckets
SET public = false
WHERE id IN ('lead-photos', 'survey-media', 'job-media', 'receipts')
  AND public IS DISTINCT FROM false;
