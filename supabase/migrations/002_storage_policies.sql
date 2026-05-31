-- ============================================================
-- Storage: create buckets + RLS policies
-- Supabase Storage uses PostgreSQL RLS on storage.objects.
-- The public-table DO-block in 001 does NOT cover storage.*.
-- ============================================================

-- 1. Ensure buckets exist and are public (safe to re-run).
--    Public buckets allow getPublicUrl() to return a directly loadable URL.
--    Paths are UUID-based so they are not guessable.
INSERT INTO storage.buckets (id, name, public)
  VALUES
    ('lead-photos',  'lead-photos',  true),
    ('survey-media', 'survey-media', true),
    ('invoices',     'invoices',     true),
    ('proposals',    'proposals',    true)
  ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 2. Storage policies — authenticated users can SELECT / INSERT / UPDATE / DELETE
--    in every bucket used by this application.

DO $$
DECLARE
  bucket TEXT;
  buckets TEXT[] := ARRAY['lead-photos', 'survey-media', 'invoices', 'proposals'];
BEGIN
  FOREACH bucket IN ARRAY buckets LOOP
    -- SELECT
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'authenticated_select_' || bucket
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_select_%s"
         ON storage.objects FOR SELECT TO authenticated
         USING (bucket_id = %L)',
        bucket, bucket
      );
    END IF;

    -- INSERT
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'authenticated_insert_' || bucket
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_insert_%s"
         ON storage.objects FOR INSERT TO authenticated
         WITH CHECK (bucket_id = %L)',
        bucket, bucket
      );
    END IF;

    -- UPDATE
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'authenticated_update_' || bucket
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_update_%s"
         ON storage.objects FOR UPDATE TO authenticated
         USING (bucket_id = %L)',
        bucket, bucket
      );
    END IF;

    -- DELETE
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'authenticated_delete_' || bucket
    ) THEN
      EXECUTE format(
        'CREATE POLICY "authenticated_delete_%s"
         ON storage.objects FOR DELETE TO authenticated
         USING (bucket_id = %L)',
        bucket, bucket
      );
    END IF;
  END LOOP;
END $$;
