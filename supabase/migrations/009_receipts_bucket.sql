-- Storage bucket for expense receipt photos.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('receipts', 'receipts', true)
  ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$
DECLARE bucket TEXT := 'receipts';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_select_' || bucket
  ) THEN
    EXECUTE format(
      'CREATE POLICY "authenticated_select_%s" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L)',
      bucket, bucket
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_insert_' || bucket
  ) THEN
    EXECUTE format(
      'CREATE POLICY "authenticated_insert_%s" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)',
      bucket, bucket
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'authenticated_delete_' || bucket
  ) THEN
    EXECUTE format(
      'CREATE POLICY "authenticated_delete_%s" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L)',
      bucket, bucket
    );
  END IF;
END $$;
