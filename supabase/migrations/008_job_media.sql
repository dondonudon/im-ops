-- Storage bucket for job documentation files.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('job-media', 'job-media', true)
  ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$
DECLARE bucket TEXT := 'job-media';
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

-- Job documentation: photos and PDFs uploaded during or after a job.
create table job_media (
  id           uuid        primary key default gen_random_uuid(),
  job_id       uuid        not null references jobs(id) on delete cascade,
  media_type   text        not null check (media_type in ('photo', 'pdf')),
  storage_path text        not null,
  file_name    text,
  caption      text,
  uploaded_at  timestamptz not null default now()
);

create index on job_media (job_id);

alter table job_media enable row level security;

create policy "authenticated can read job_media"
  on job_media for select to authenticated using (true);

create policy "authenticated can insert job_media"
  on job_media for insert to authenticated with check (true);

create policy "authenticated can delete job_media"
  on job_media for delete to authenticated using (true);
