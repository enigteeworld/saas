-- ============================================================================
-- EnigteeWorld AVATARS bucket
-- Run ONCE in the Supabase SQL Editor. Idempotent.
--
-- The 'avatars' bucket is PUBLIC (profile pictures are not sensitive, and a
-- public URL is what lets them render instantly across every portal without a
-- signed-URL round trip). Each user may only write inside their own folder,
-- named by their auth uid, e.g. avatars/<uid>/<file>.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  3145728, -- 3 MB
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can replace their own avatar" on storage.objects;
create policy "Users can replace their own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Admins can manage all avatars" on storage.objects;
create policy "Admins can manage all avatars"
on storage.objects for all to authenticated
using (bucket_id = 'avatars' and public.is_admin())
with check (bucket_id = 'avatars' and public.is_admin());
