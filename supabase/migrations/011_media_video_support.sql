-- 011_media_video_support.sql
-- Extend the evidence galleries (lead photos, job media) to store video
-- alongside images. survey_media already allows ('photo','video') from the
-- consolidated base schema, so it needs no change here.

-- lead_photos had no media_type column at all (photos only). Add one; every
-- existing row is a photo, so default + backfill to 'photo'.
ALTER TABLE lead_photos
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'photo'
    CHECK (media_type IN ('photo', 'video'));

-- job_media allowed ('photo','pdf'); widen the check to also allow 'video'.
-- The inline CHECK from the base schema is auto-named job_media_media_type_check.
ALTER TABLE job_media DROP CONSTRAINT IF EXISTS job_media_media_type_check;
ALTER TABLE job_media
  ADD CONSTRAINT job_media_media_type_check
    CHECK (media_type IN ('photo', 'video', 'pdf'));
