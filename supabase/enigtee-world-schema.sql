
-- EnigteeWorld workforce, recruitment and employee-management schema
-- Run this only in the NEW EnigteeWorld Supabase project.

create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin','employee','employer');
create type public.job_status as enum ('draft','published','paused','closed','archived');
create type public.application_status as enum ('draft','submitted','under_review','shortlisted','interview_invited','interview_scheduled','interview_completed','successful','unsuccessful','selected','onboarding','employed','rejected','withdrawn','on_hold','closed');
create type public.employment_status as enum ('selected','onboarding','pending_start','active','suspended','on_leave','terminated','completed');
create type public.document_kind as enum ('cv','application_letter','certificate','identity','recruitment_form','onboarding_form','other');
create type public.interview_status as enum ('invited','scheduled','rescheduled','completed','cancelled','successful','unsuccessful');
create type public.attendance_status as enum ('present','late','absent','approved_leave','unapproved_absence','pending_review','corrected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  phone text,
  full_name text not null,
  avatar_url text,
  role public.user_role not null default 'employee',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.profiles(id) on delete cascade,
  date_of_birth date,
  address text,
  state text,
  lga text,
  highest_qualification text,
  field_of_study text,
  professional_summary text,
  skills text[] not null default '{}',
  years_experience numeric(5,2),
  preferred_location text,
  profile_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.profiles(id) on delete cascade,
  business_name text not null,
  business_type text,
  business_email text,
  business_phone text,
  business_address text,
  website text,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employer_profiles(id) on delete cascade,
  name text not null,
  address text not null,
  city text,
  state text,
  contact_name text,
  contact_phone text,
  qr_secret text not null default encode(gen_random_bytes(24),'hex'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_openings (
  id uuid primary key default gen_random_uuid(),
  job_number text unique not null default ('EW-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,6))),
  title text not null,
  slug text,
  description text not null,
  responsibilities text,
  requirements text,
  qualifications text,
  employment_type text not null default 'full-time',
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  salary_currency text not null default 'NGN',
  positions_available integer not null default 1 check (positions_available > 0),
  location text not null,
  employer_id uuid references public.employer_profiles(id),
  establishment_id uuid references public.establishments(id),
  deadline date,
  application_sources text[] not null default array['website'],
  status public.job_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  application_number text unique not null default ('APP-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,6))),
  job_id uuid not null references public.job_openings(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'website' check (source in ('website','indeed','linkedin','referral','manual','other')),
  status public.application_status not null default 'submitted',
  cover_letter text,
  availability_date date,
  expected_salary numeric(12,2),
  application_snapshot jsonb not null default '{}'::jsonb,
  admin_notes text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, applicant_id)
);

create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete cascade,
  document_kind public.document_kind not null,
  file_path text not null,
  original_name text,
  mime_type text,
  file_size bigint,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete cascade,
  scheduled_for timestamptz,
  meeting_url text,
  instructions text,
  status public.interview_status not null default 'invited',
  outcome_notes text,
  invited_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  document_kind public.document_kind not null default 'other',
  file_path text not null,
  is_public boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.document_assignments (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.document_resources(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid references public.job_applications(id) on delete set null,
  viewed_at timestamptz,
  downloaded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(resource_id, profile_id, application_id)
);

create table public.deployments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid unique references public.job_applications(id),
  employee_id uuid not null references public.profiles(id),
  employer_id uuid not null references public.employer_profiles(id),
  establishment_id uuid not null references public.establishments(id),
  role_title text not null,
  agreed_salary numeric(12,2) not null default 0,
  salary_currency text not null default 'NGN',
  status public.employment_status not null default 'selected',
  start_date date,
  end_date date,
  employer_final_approval_required boolean not null default false,
  employer_approved_at timestamptz,
  activated_at timestamptz,
  ended_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  employee_id uuid not null references public.profiles(id),
  establishment_id uuid not null references public.establishments(id),
  attendance_date date not null default current_date,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status public.attendance_status not null default 'present',
  source text not null default 'qr',
  review_notes text,
  created_at timestamptz not null default now(),
  unique(deployment_id, attendance_date)
);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','calculated','reviewed','approved','processing','paid','failed','cancelled')),
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(period_end >= period_start)
);

create table public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  deployment_id uuid not null references public.deployments(id),
  employee_id uuid not null references public.profiles(id),
  employer_id uuid not null references public.employer_profiles(id),
  salary_snapshot numeric(12,2) not null,
  days_present integer not null default 0,
  deductions numeric(12,2) not null default 0,
  bonuses numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null default 0,
  payment_status text not null default 'pending' check (payment_status in ('pending','processing','paid','failed')),
  created_at timestamptz not null default now(),
  unique(payroll_run_id, deployment_id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null default ('INV-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,6))),
  employer_id uuid not null references public.employer_profiles(id),
  period_start date not null,
  period_end date not null,
  subtotal numeric(12,2) not null default 0,
  service_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','issued','viewed','partially_paid','paid','overdue','cancelled')),
  due_date date,
  issued_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  deployment_id uuid references public.deployments(id),
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active = true); $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare assigned_role public.user_role;
begin
  assigned_role := case when (new.raw_user_meta_data->>'role') in ('employer','employee') then (new.raw_user_meta_data->>'role')::public.user_role else 'employee' end;
  insert into public.profiles(id,email,full_name,phone,role)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name','New user'),new.raw_user_meta_data->>'phone',assigned_role)
  on conflict (id) do update set email=excluded.email;
  if assigned_role = 'employee' then
    insert into public.staff_profiles(user_id) values(new.id) on conflict(user_id) do nothing;
  elsif assigned_role = 'employer' then
    insert into public.employer_profiles(user_id,business_name,business_email)
    values(new.id,coalesce(new.raw_user_meta_data->>'business_name',coalesce(new.raw_user_meta_data->>'full_name','New business')),new.email)
    on conflict(user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','staff_profiles','employer_profiles','establishments','job_openings','job_applications','interviews','deployments','payroll_runs','invoices'] loop
    execute format('drop trigger if exists touch_%I on public.%I',t,t);
    execute format('create trigger touch_%I before update on public.%I for each row execute function public.touch_updated_at()',t,t);
  end loop;
end $$;

create index idx_profiles_role on public.profiles(role);
create index idx_jobs_status on public.job_openings(status);
create index idx_jobs_deadline on public.job_openings(deadline);
create index idx_applications_applicant on public.job_applications(applicant_id);
create index idx_applications_job on public.job_applications(job_id);
create index idx_applications_status on public.job_applications(status);
create index idx_deployments_employee on public.deployments(employee_id);
create index idx_deployments_employer on public.deployments(employer_id);
create index idx_attendance_employee_date on public.attendance_events(employee_id,attendance_date);
create index idx_notifications_profile on public.notifications(profile_id,is_read);

alter table public.profiles enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.employer_profiles enable row level security;
alter table public.establishments enable row level security;
alter table public.job_openings enable row level security;
alter table public.job_applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.interviews enable row level security;
alter table public.document_resources enable row level security;
alter table public.document_assignments enable row level security;
alter table public.deployments enable row level security;
alter table public.attendance_events enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "own profile" on public.profiles for select using (id=auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update using (id=auth.uid() or public.is_admin());
create policy "admin manage profiles" on public.profiles for all using (public.is_admin());

create policy "own staff profile" on public.staff_profiles for all using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());
create policy "own employer profile" on public.employer_profiles for all using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());
create policy "employer establishments" on public.establishments for all using (employer_id in (select id from public.employer_profiles where user_id=auth.uid()) or public.is_admin()) with check (employer_id in (select id from public.employer_profiles where user_id=auth.uid()) or public.is_admin());

create policy "published jobs public" on public.job_openings for select using (status='published' or public.is_admin() or employer_id in (select id from public.employer_profiles where user_id=auth.uid()));
create policy "admin manage jobs" on public.job_openings for all using (public.is_admin()) with check (public.is_admin());

create policy "applicant own applications" on public.job_applications for select using (applicant_id=auth.uid() or public.is_admin() or job_id in (select id from public.job_openings where employer_id in (select id from public.employer_profiles where user_id=auth.uid())));
create policy "applicant create application" on public.job_applications for insert with check (applicant_id=auth.uid());
create policy "admin manage applications" on public.job_applications for all using (public.is_admin()) with check (public.is_admin());

create policy "application documents access" on public.application_documents for all using (uploaded_by=auth.uid() or application_id in (select id from public.job_applications where applicant_id=auth.uid()) or public.is_admin()) with check (uploaded_by=auth.uid() or public.is_admin());
create policy "interview access" on public.interviews for select using (public.is_admin() or application_id in (select id from public.job_applications where applicant_id=auth.uid()) or application_id in (select ja.id from public.job_applications ja join public.job_openings jo on jo.id=ja.job_id join public.employer_profiles ep on ep.id=jo.employer_id where ep.user_id=auth.uid()));
create policy "admin manage interviews" on public.interviews for all using (public.is_admin()) with check (public.is_admin());

create policy "own assignments" on public.document_assignments for select using (profile_id=auth.uid() or public.is_admin());
create policy "resource access" on public.document_resources for select using (is_public or public.is_admin() or id in (select resource_id from public.document_assignments where profile_id=auth.uid()));
create policy "admin manage resources" on public.document_resources for all using (public.is_admin()) with check (public.is_admin());

create policy "deployment access" on public.deployments for select using (employee_id=auth.uid() or employer_id in (select id from public.employer_profiles where user_id=auth.uid()) or public.is_admin());
create policy "admin manage deployments" on public.deployments for all using (public.is_admin()) with check (public.is_admin());

create policy "attendance access" on public.attendance_events for select using (employee_id=auth.uid() or establishment_id in (select e.id from public.establishments e join public.employer_profiles ep on ep.id=e.employer_id where ep.user_id=auth.uid()) or public.is_admin());
create policy "employee create attendance" on public.attendance_events for insert with check (employee_id=auth.uid());
create policy "admin manage attendance" on public.attendance_events for all using (public.is_admin()) with check (public.is_admin());

create policy "payroll admin" on public.payroll_runs for all using (public.is_admin()) with check (public.is_admin());
create policy "payroll item access" on public.payroll_items for select using (employee_id=auth.uid() or employer_id in (select id from public.employer_profiles where user_id=auth.uid()) or public.is_admin());
create policy "invoice employer access" on public.invoices for select using (employer_id in (select id from public.employer_profiles where user_id=auth.uid()) or public.is_admin());
create policy "invoice item access" on public.invoice_items for select using (invoice_id in (select id from public.invoices where employer_id in (select id from public.employer_profiles where user_id=auth.uid()) or public.is_admin()));
create policy "own notifications" on public.notifications for select using (profile_id=auth.uid() or public.is_admin());
create policy "update own notifications" on public.notifications for update using (profile_id=auth.uid() or public.is_admin());
create policy "admin audit" on public.audit_logs for all using (public.is_admin()) with check (public.is_admin());

insert into public.job_openings(title,description,location,employment_type,created_by,status)
select 'Administrative Assistant','Support daily administration, records, communication and coordination.','Benin City, Edo','full-time',id,'draft'
from public.profiles where role='admin' limit 1;
