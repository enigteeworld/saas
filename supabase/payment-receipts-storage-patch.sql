-- ============================================================================
-- EnigteeWorld PAYMENT RECEIPTS bucket
-- Run ONCE in the Supabase SQL Editor. Idempotent.
--
-- Private bucket - an employer's proof-of-payment receipt for an invoice.
-- Each employer writes only inside their own folder (named by their auth
-- uid); admin can read every receipt to verify payments; nobody gets a
-- public URL - access is always via a short-lived signed URL.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880, -- 5 MB
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "Employers upload their own receipts" on storage.objects;
create policy "Employers upload their own receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Employers read their own receipts" on storage.objects;
create policy "Employers read their own receipts"
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-receipts'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists "Employers replace their own receipts" on storage.objects;
create policy "Employers replace their own receipts"
on storage.objects for update to authenticated
using (bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Admins manage all receipts" on storage.objects;
create policy "Admins manage all receipts"
on storage.objects for all to authenticated
using (bucket_id = 'payment-receipts' and public.is_admin())
with check (bucket_id = 'payment-receipts' and public.is_admin());
