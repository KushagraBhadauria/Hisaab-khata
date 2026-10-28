-- =====================================================================
-- Hisaab Khata — update 003: bill / receipt photos (free Supabase Storage)
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run.
-- =====================================================================

-- 1) each entry can carry up to 4 photos
alter table public.entries add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.entries drop constraint if exists entries_max_4_bills;
alter table public.entries add constraint entries_max_4_bills
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 4);

-- 2) storage bucket "bills"
--    public = the link opens without login (needed so a PDF you send on WhatsApp can open the photo).
--    File names are long random IDs, so nobody can guess or list them.
--    Max 2 MB per file (the app shrinks photos to ~100–300 KB anyway), images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bills', 'bills', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3) only the owner can upload / replace / delete / list their own photos
--    (files live in bills/<user id>/...)
drop policy if exists "bills: owner can read"   on storage.objects;
drop policy if exists "bills: owner can upload" on storage.objects;
drop policy if exists "bills: owner can update" on storage.objects;
drop policy if exists "bills: owner can delete" on storage.objects;

create policy "bills: owner can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'bills' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "bills: owner can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bills' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "bills: owner can update" on storage.objects
  for update to authenticated
  using (bucket_id = 'bills' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'bills' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "bills: owner can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bills' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- make the API see the new column immediately
notify pgrst, 'reload schema';
