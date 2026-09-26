-- EnigteeWorld document-storage hardening patch
-- Run this in the NEW EnigteeWorld Supabase project after the main schema.
-- The employee-documents bucket must remain PRIVATE.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'employee-documents',
  'employee-documents',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- STORAGE POLICIES
-- ------------------------------------------------------------

drop policy if exists "Employees can upload their own documents" on storage.objects;
create policy "Employees can upload their own documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Employees can view their own documents" on storage.objects;
create policy "Employees can view their own documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.document_resources dr
      join public.document_assignments da
        on da.resource_id = dr.id
      where da.profile_id = auth.uid()
        and dr.file_path = storage.objects.name
    )
  )
);

drop policy if exists "Employees can update their own documents" on storage.objects;
create policy "Employees can update their own documents"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Employees can delete their own documents" on storage.objects;
create policy "Employees can delete their own documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Employers can view application documents" on storage.objects;
create policy "Employers can view application documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and exists (
    select 1
    from public.application_documents ad
    join public.job_applications ja
      on ja.id = ad.application_id
    join public.job_openings jo
      on jo.id = ja.job_id
    join public.employer_profiles ep
      on ep.id = jo.employer_id
    where ad.file_path = storage.objects.name
      and ep.user_id = auth.uid()
  )
);

drop policy if exists "Admins can manage employee documents" on storage.objects;
create policy "Admins can manage employee documents"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'employee-documents'
  and public.is_admin()
)
with check (
  bucket_id = 'employee-documents'
  and public.is_admin()
);

-- ------------------------------------------------------------
-- APPLICATION DOCUMENT DATABASE POLICIES
-- ------------------------------------------------------------

drop policy if exists "Employers can view application documents" on public.application_documents;
create policy "Employers can view application documents"
on public.application_documents
for select
using (
  exists (
    select 1
    from public.job_applications ja
    join public.job_openings jo
      on jo.id = ja.job_id
    join public.employer_profiles ep
      on ep.id = jo.employer_id
    where ja.id = application_documents.application_id
      and ep.user_id = auth.uid()
  )
  or uploaded_by = auth.uid()
  or public.is_admin()
);

-- Prevent an application from having multiple documents of the same kind.
-- If the table already contains duplicate kinds, remove the duplicates first
-- before running this index.
create unique index if not exists ux_application_documents_kind
on public.application_documents(application_id, document_kind);

-- ------------------------------------------------------------
-- ASSIGNED-DOCUMENT TRACKING
-- ------------------------------------------------------------

drop policy if exists "Employees can update their own document assignments" on public.document_assignments;
create policy "Employees can update their own document assignments"
on public.document_assignments
for update
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

-- ------------------------------------------------------------
-- EMPLOYER VISIBILITY
-- Allow an employer to see the candidate profile attached to one of its
-- applications. This is needed by the employer candidate/workforce pages.
-- ------------------------------------------------------------

drop policy if exists "employers can view applicant profiles" on public.profiles;
create policy "employers can view applicant profiles"
on public.profiles
for select
using (
  exists (
    select 1
    from public.job_applications ja
    join public.job_openings jo
      on jo.id = ja.job_id
    join public.employer_profiles ep
      on ep.id = jo.employer_id
    where ja.applicant_id = profiles.id
      and ep.user_id = auth.uid()
  )
  or id = auth.uid()
  or public.is_admin()
);

drop policy if exists "employers can view applicant staff profiles" on public.staff_profiles;
create policy "employers can view applicant staff profiles"
on public.staff_profiles
for select
using (
  exists (
    select 1
    from public.job_applications ja
    join public.job_openings jo
      on jo.id = ja.job_id
    join public.employer_profiles ep
      on ep.id = jo.employer_id
    where ja.applicant_id = staff_profiles.user_id
      and ep.user_id = auth.uid()
  )
  or user_id = auth.uid()
  or public.is_admin()
);

-- ------------------------------------------------------------
-- EMPLOYER STAFFING REQUESTS
-- Employers can submit a draft job request. Admin remains the only role
-- allowed to publish/manage the recruitment lifecycle.
-- ------------------------------------------------------------

drop policy if exists "employers can create draft job requests" on public.job_openings;
create policy "employers can create draft job requests"
on public.job_openings
for insert
to authenticated
with check (
  status = 'draft'
  and employer_id in (
    select id
    from public.employer_profiles
    where user_id = auth.uid()
  )
  and created_by = auth.uid()
);

drop policy if exists "employers can update their draft job requests" on public.job_openings;
create policy "employers can update their draft job requests"
on public.job_openings
for update
to authenticated
using (
  status = 'draft'
  and employer_id in (
    select id
    from public.employer_profiles
    where user_id = auth.uid()
  )
)
with check (
  status = 'draft'
  and employer_id in (
    select id
    from public.employer_profiles
    where user_id = auth.uid()
  )
);

-- ------------------------------------------------------------
-- OPTIONAL CLEANUP
-- ------------------------------------------------------------
-- Do NOT delete the old bucket manually if it contains files.
-- The application now expects the bucket name exactly:
-- employee-documents


-- ------------------------------------------------------------
-- DRAFT APPLICATION CLEANUP
-- The client creates a draft first, uploads the documents, then submits it.
-- Applicants may delete only their own draft applications if an upload fails.
-- ------------------------------------------------------------

drop policy if exists "applicant can delete own draft application" on public.job_applications;
create policy "applicant can delete own draft application"
on public.job_applications
for delete
to authenticated
using (
  applicant_id = auth.uid()
  and status = 'draft'
);
