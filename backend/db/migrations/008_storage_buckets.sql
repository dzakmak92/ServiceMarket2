-- ═══════════════════════════════════════════════════════════════════════
-- 008 · Storage buckets (replaces GridFS)
--
-- All five are PRIVATE. Job photos show the inside of people's homes,
-- licence uploads are identity documents, receipts are financial records.
-- Under DSGVO a guessable public URL to a customer's kitchen is a breach
-- waiting to be reported.
--
-- Access is always a short-lived signed URL, minted by the backend only
-- after it has checked that the caller owns the parent row. Object keys are
-- {pro_id}/{job_id}/{uuid}.{ext}, so the prefix carries ownership and an
-- account erasure is a prefix delete rather than a hunt.
-- ═══════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('job-photos',  'job-photos',  false, 15728640,
   array['image/jpeg','image/png','image/webp','image/heic']),
  ('documents',   'documents',   false, 20971520,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('receipts',    'receipts',    false, 10485760,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('logos',       'logos',       false, 2097152,
   array['image/jpeg','image/png','image/webp','image/svg+xml']),
  ('signatures',  'signatures',  false, 1048576,
   array['image/png','image/svg+xml'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;
