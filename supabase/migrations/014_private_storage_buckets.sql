-- Switch invoices and proposals storage buckets to private.
-- These buckets store contractual PDFs that should not be accessible
-- via unauthenticated public URLs. Signed URLs should be issued on demand.
-- lead-photos and survey-media remain public (lower sensitivity, no change here).

UPDATE storage.buckets
SET public = false
WHERE id IN ('invoices', 'proposals');
