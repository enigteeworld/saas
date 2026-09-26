-- ============================================================================
-- EnigteeWorld WORKFLOW PATCH
-- Run this ONCE in the Supabase SQL Editor (after enigtee-world-schema.sql and
-- document-upload-patch.sql). It is idempotent - safe to run again.
--
-- What it fixes / adds
--   1. Notifications could never be created (no INSERT policy) -> fixed, and now
--      created automatically by database triggers for every workflow event.
--   2. Email queue (email_outbox) + triggers. The `send-notification-emails`
--      edge function delivers the queue through Resend.
--   3. Interview details (mode, location, notes) + automatic status sync.
--   4. Admin -> employee document push (document_assignments admin policy).
--   5. Hire -> deployment conversion RPC (admin_assign_deployment) so an
--      employed applicant shows up in the employer portal.
--   6. Default establishment per employer (auto-created + back-filled) and
--      auto-filled on every job opening / staffing request.
--   7. Missing read policies (employee sees employer/establishment/job of their
--      own applications & deployments; employer sees deployed employees).
--   8. Employer staffing requests notify every admin.
--   9. Application status history (application_events) shown to admin/employee.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Columns
-- ---------------------------------------------------------------------------
alter table public.job_applications add column if not exists status_message text;

alter table public.interviews add column if not exists mode text not null default 'online';
alter table public.interviews add column if not exists location text;
alter table public.interviews add column if not exists duration_minutes integer;
do $$ begin
  alter table public.interviews add constraint interviews_mode_check check (mode in ('online','in_person','phone'));
exception when duplicate_object then null; end $$;

alter table public.document_assignments add column if not exists note text;
alter table public.document_assignments add column if not exists assigned_by uuid references public.profiles(id);

alter table public.deployments add column if not exists hr_message text;
alter table public.establishments add column if not exists is_default boolean not null default false;

-- ---------------------------------------------------------------------------
-- 1. New tables
-- ---------------------------------------------------------------------------
create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete cascade,
  status text not null,
  message text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_application_events_app on public.application_events(application_id, created_at desc);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  to_email text not null,
  subject text not null,
  heading text not null,
  body text not null,
  link_path text,
  link_label text,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists idx_email_outbox_status on public.email_outbox(status, created_at);

alter table public.application_events enable row level security;
alter table public.email_outbox enable row level security;

drop policy if exists "application events read" on public.application_events;
create policy "application events read" on public.application_events for select
using (
  public.is_admin()
  or application_id in (select id from public.job_applications where applicant_id = auth.uid())
);

drop policy if exists "admin reads email outbox" on public.email_outbox;
create policy "admin reads email outbox" on public.email_outbox for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. RLS helper functions (SECURITY DEFINER avoids policy recursion)
-- ---------------------------------------------------------------------------
create or replace function public.employee_can_see_employer(eid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.deployments d where d.employer_id = eid and d.employee_id = auth.uid())
      or exists (
        select 1 from public.job_openings jo
        where jo.employer_id = eid
          and (jo.status = 'published'
               or exists (select 1 from public.job_applications ja where ja.job_id = jo.id and ja.applicant_id = auth.uid()))
      );
$$;

create or replace function public.employee_can_see_establishment(eid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.deployments d where d.establishment_id = eid and d.employee_id = auth.uid());
$$;

create or replace function public.applicant_has_applied(jid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.job_applications ja where ja.job_id = jid and ja.applicant_id = auth.uid());
$$;

create or replace function public.employer_can_see_employee(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.deployments d
    join public.employer_profiles ep on ep.id = d.employer_id
    where d.employee_id = pid and ep.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Policies
-- ---------------------------------------------------------------------------
-- Notifications: admin may insert directly; everyone may delete their own.
drop policy if exists "admin insert notifications" on public.notifications;
create policy "admin insert notifications" on public.notifications for insert with check (public.is_admin());
drop policy if exists "delete own notifications" on public.notifications;
create policy "delete own notifications" on public.notifications for delete using (profile_id = auth.uid());

-- Applicants can submit (draft -> submitted) or withdraw their own application.
drop policy if exists "applicant submits own draft" on public.job_applications;
create policy "applicant submits own draft" on public.job_applications for update to authenticated
using (applicant_id = auth.uid() and status in ('draft','submitted'))
with check (applicant_id = auth.uid() and status in ('draft','submitted','withdrawn'));

-- Admin pushes documents to employees.
drop policy if exists "admin manage assignments" on public.document_assignments;
create policy "admin manage assignments" on public.document_assignments for all
using (public.is_admin()) with check (public.is_admin());

-- Read access along the recruitment chain.
drop policy if exists "employee sees related employers" on public.employer_profiles;
create policy "employee sees related employers" on public.employer_profiles for select
using (public.employee_can_see_employer(id));

drop policy if exists "employee sees own establishment" on public.establishments;
create policy "employee sees own establishment" on public.establishments for select
using (public.employee_can_see_establishment(id));

drop policy if exists "applicant sees applied jobs" on public.job_openings;
create policy "applicant sees applied jobs" on public.job_openings for select
using (public.applicant_has_applied(id));

drop policy if exists "employer sees deployed employees" on public.profiles;
create policy "employer sees deployed employees" on public.profiles for select
using (public.employer_can_see_employee(id));

drop policy if exists "employer sees deployed staff profiles" on public.staff_profiles;
create policy "employer sees deployed staff profiles" on public.staff_profiles for select
using (public.employer_can_see_employee(user_id));

-- ---------------------------------------------------------------------------
-- 4. Notification + email helpers (internal - not callable from the browser)
-- ---------------------------------------------------------------------------
create or replace function public.notify_user(
  p_profile uuid, p_type text, p_title text, p_message text,
  p_link text default null, p_data jsonb default '{}'::jsonb, p_email boolean default true
) returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if p_profile is null then return; end if;
  select email into v_email from public.profiles where id = p_profile and is_active = true;
  if v_email is null then return; end if;

  insert into public.notifications(profile_id, type, title, message, data)
  values (p_profile, coalesce(p_type,'system'), p_title, p_message,
          coalesce(p_data,'{}'::jsonb) || jsonb_build_object('link', p_link));

  if p_email then
    insert into public.email_outbox(profile_id, to_email, subject, heading, body, link_path, link_label)
    values (p_profile, v_email, p_title || ' - EnigteeWorld', p_title, p_message, p_link, 'Open your dashboard');
  end if;
end $$;

create or replace function public.notify_admins(
  p_type text, p_title text, p_message text, p_link text default null, p_data jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'admin' and is_active = true loop
    perform public.notify_user(r.id, p_type, p_title, p_message, p_link, p_data, true);
  end loop;
end $$;

revoke all on function public.notify_user(uuid,text,text,text,text,jsonb,boolean) from public, anon, authenticated;
revoke all on function public.notify_admins(text,text,text,text,jsonb) from public, anon, authenticated;

create or replace function public.fmt_wat(ts timestamptz)
returns text language sql immutable as $$
  select to_char(ts at time zone 'Africa/Lagos', 'FMDay, DD Mon YYYY "at" HH12:MI AM') || ' (WAT)';
$$;

-- ---------------------------------------------------------------------------
-- 5. Application status -> history, applicant notification + email, admin alert
-- ---------------------------------------------------------------------------
create or replace function public.trg_application_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text; v_num text := NEW.application_number; v_name text;
  v_head text; v_body text; v_hr text := null; v_has_deployment boolean;
begin
  if NEW.status = 'draft' then return NEW; end if;
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then return NEW; end if;

  if TG_OP = 'INSERT' then v_hr := NEW.status_message;
  elsif NEW.status_message is distinct from OLD.status_message then v_hr := NEW.status_message; end if;

  insert into public.application_events(application_id, status, message, actor_id)
  values (NEW.id, NEW.status::text, v_hr, auth.uid());

  select jo.title into v_title from public.job_openings jo where jo.id = NEW.job_id;
  v_title := coalesce(v_title, 'the role');
  select full_name into v_name from public.profiles where id = NEW.applicant_id;

  -- Admin alert for every newly submitted application
  if NEW.status = 'submitted' then
    perform public.notify_admins('application', 'New application received',
      coalesce(v_name,'A candidate') || ' applied for ' || v_title || ' (' || v_num || ').',
      '/admin/applications/' || NEW.id);
  end if;

  -- Statuses that are announced by another trigger (interview / deployment)
  if NEW.status = 'interview_scheduled' then return NEW; end if;
  select exists(select 1 from public.deployments d where d.application_id = NEW.id) into v_has_deployment;
  if NEW.status in ('selected','onboarding','employed') and v_has_deployment then return NEW; end if;

  v_head := case NEW.status::text
    when 'submitted'           then 'Application received'
    when 'under_review'        then 'Your application is under review'
    when 'shortlisted'         then 'You have been shortlisted'
    when 'interview_invited'   then 'You are invited to an interview'
    when 'interview_completed' then 'Interview completed'
    when 'successful'          then 'Congratulations - you were successful'
    when 'unsuccessful'        then 'Application outcome'
    when 'selected'            then 'You have been selected'
    when 'onboarding'          then 'Onboarding has started'
    when 'employed'            then 'Welcome aboard - you are now employed'
    when 'rejected'            then 'Application outcome'
    when 'on_hold'             then 'Your application is on hold'
    when 'withdrawn'           then 'Application withdrawn'
    when 'closed'              then 'Application closed'
    else 'Application update' end;

  v_body := case NEW.status::text
    when 'submitted'           then 'Your application for ' || v_title || ' (' || v_num || ') has been received. Our HR team will review it and keep you updated here and by email.'
    when 'under_review'        then 'HR has started reviewing your application for ' || v_title || ' (' || v_num || ').'
    when 'shortlisted'         then 'Good news - you have been shortlisted for ' || v_title || ' (' || v_num || '). Watch for interview details.'
    when 'interview_invited'   then 'You are invited to interview for ' || v_title || ' (' || v_num || '). HR will share the date and details shortly.'
    when 'interview_completed' then 'Your interview for ' || v_title || ' (' || v_num || ') is complete. HR will confirm the outcome soon.'
    when 'successful'          then 'You were successful for ' || v_title || ' (' || v_num || '). HR will contact you with the recruitment paperwork and next steps.'
    when 'unsuccessful'        then 'Thank you for your time. Unfortunately you were not successful for ' || v_title || ' (' || v_num || ') on this occasion.'
    when 'selected'            then 'You have been selected for ' || v_title || ' (' || v_num || '). Your placement details will follow.'
    when 'onboarding'          then 'Your onboarding for ' || v_title || ' (' || v_num || ') has begun. Check your Documents page for forms to complete.'
    when 'employed'            then 'You are now employed for ' || v_title || ' (' || v_num || '). Open the Employment page for details.'
    when 'rejected'            then 'Thank you for applying. Unfortunately your application for ' || v_title || ' (' || v_num || ') was not taken forward.'
    when 'on_hold'             then 'Your application for ' || v_title || ' (' || v_num || ') has been placed on hold. We will update you when it moves forward.'
    when 'withdrawn'           then 'Your application for ' || v_title || ' (' || v_num || ') has been withdrawn.'
    when 'closed'              then 'Your application for ' || v_title || ' (' || v_num || ') has been closed.'
    else 'Your application for ' || v_title || ' (' || v_num || ') is now ' || replace(NEW.status::text,'_',' ') || '.' end;

  if v_hr is not null and length(trim(v_hr)) > 0 then
    v_body := v_body || E'\n\nMessage from HR: ' || v_hr;
  end if;

  perform public.notify_user(NEW.applicant_id, 'application', v_head, v_body,
    '/employee/applications/' || NEW.id, jsonb_build_object('application_id', NEW.id, 'status', NEW.status));
  return NEW;
end $$;

drop trigger if exists application_status_notify on public.job_applications;
create trigger application_status_notify
after insert or update of status, status_message on public.job_applications
for each row execute function public.trg_application_status();

-- ---------------------------------------------------------------------------
-- 6. Interviews -> applicant notification + email + application status sync
-- ---------------------------------------------------------------------------
create or replace function public.trg_interview_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_app record; v_title text; v_body text; v_head text; v_changed boolean := false;
begin
  select ja.id, ja.applicant_id, ja.application_number, ja.status, jo.title
    into v_app
  from public.job_applications ja join public.job_openings jo on jo.id = ja.job_id
  where ja.id = NEW.application_id;
  if not found then return NEW; end if;
  v_title := v_app.title;

  if NEW.status::text in ('scheduled','rescheduled') and NEW.scheduled_for is not null then
    if TG_OP = 'INSERT' then v_changed := true;
    else
      v_changed := NEW.status is distinct from OLD.status
        or NEW.scheduled_for is distinct from OLD.scheduled_for
        or NEW.meeting_url is distinct from OLD.meeting_url
        or NEW.location is distinct from OLD.location
        or NEW.mode is distinct from OLD.mode
        or NEW.instructions is distinct from OLD.instructions;
    end if;

    if v_changed then
      v_head := case when NEW.status::text = 'rescheduled' or (TG_OP = 'UPDATE' and OLD.scheduled_for is not null and OLD.scheduled_for is distinct from NEW.scheduled_for)
                     then 'Interview rescheduled' else 'Interview scheduled' end;
      v_body := 'Your interview for ' || v_title || ' (' || v_app.application_number || ') is set for ' || public.fmt_wat(NEW.scheduled_for) || '.';
      v_body := v_body || E'\n\nFormat: ' || case NEW.mode when 'online' then 'Online interview' when 'phone' then 'Phone interview' else 'In-person interview' end;
      if NEW.meeting_url is not null and length(trim(NEW.meeting_url)) > 0 then v_body := v_body || E'\nMeeting link: ' || NEW.meeting_url; end if;
      if NEW.location is not null and length(trim(NEW.location)) > 0 then v_body := v_body || E'\nVenue: ' || NEW.location; end if;
      if NEW.duration_minutes is not null then v_body := v_body || E'\nDuration: ' || NEW.duration_minutes || ' minutes'; end if;
      if NEW.instructions is not null and length(trim(NEW.instructions)) > 0 then v_body := v_body || E'\n\nNote from HR: ' || NEW.instructions; end if;

      perform public.notify_user(v_app.applicant_id, 'interview', v_head, v_body, '/employee/interviews',
        jsonb_build_object('application_id', NEW.application_id, 'interview_id', NEW.id));

      update public.job_applications set status = 'interview_scheduled'
      where id = NEW.application_id and status <> 'interview_scheduled';
    end if;

  elsif NEW.status::text = 'invited' then
    update public.job_applications set status = 'interview_invited'
    where id = NEW.application_id and status in ('submitted','under_review','shortlisted');

  elsif NEW.status::text = 'cancelled' and (TG_OP = 'INSERT' or OLD.status is distinct from NEW.status) then
    perform public.notify_user(v_app.applicant_id, 'interview', 'Interview cancelled',
      'Your interview for ' || v_title || ' (' || v_app.application_number || ') has been cancelled. HR will contact you about next steps.' ||
      case when NEW.instructions is not null and length(trim(NEW.instructions)) > 0 then E'\n\nNote from HR: ' || NEW.instructions else '' end,
      '/employee/interviews', jsonb_build_object('application_id', NEW.application_id, 'interview_id', NEW.id));

  elsif NEW.status::text = 'completed' and (TG_OP = 'INSERT' or OLD.status is distinct from NEW.status) then
    update public.job_applications set status = 'interview_completed'
    where id = NEW.application_id and status in ('interview_scheduled','interview_invited');

  elsif NEW.status::text = 'successful' and (TG_OP = 'INSERT' or OLD.status is distinct from NEW.status) then
    update public.job_applications set status = 'successful'
    where id = NEW.application_id and status not in ('successful','selected','onboarding','employed');

  elsif NEW.status::text = 'unsuccessful' and (TG_OP = 'INSERT' or OLD.status is distinct from NEW.status) then
    update public.job_applications set status = 'unsuccessful'
    where id = NEW.application_id and status not in ('unsuccessful','rejected','employed');
  end if;

  return NEW;
end $$;

drop trigger if exists interview_change_notify on public.interviews;
create trigger interview_change_notify
after insert or update on public.interviews
for each row execute function public.trg_interview_change();

-- ---------------------------------------------------------------------------
-- 7. Documents pushed by HR -> employee notification + email
-- ---------------------------------------------------------------------------
create or replace function public.trg_document_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text; v_desc text;
begin
  select title, description into v_title, v_desc from public.document_resources where id = NEW.resource_id;
  perform public.notify_user(NEW.profile_id, 'document', 'New document from HR: ' || coalesce(v_title,'Document'),
    'HR has shared "' || coalesce(v_title,'a document') || '" with you. Open your Documents page to download it.' ||
    case when v_desc is not null and length(trim(v_desc)) > 0 then E'\n\n' || v_desc else '' end ||
    case when NEW.note is not null and length(trim(NEW.note)) > 0 then E'\n\nNote from HR: ' || NEW.note else '' end,
    '/employee/documents', jsonb_build_object('resource_id', NEW.resource_id, 'application_id', NEW.application_id));
  return NEW;
end $$;

drop trigger if exists document_assigned_notify on public.document_assignments;
create trigger document_assigned_notify after insert on public.document_assignments
for each row execute function public.trg_document_assigned();

-- ---------------------------------------------------------------------------
-- 8. Deployments: dates, application sync, employee + employer notifications
-- ---------------------------------------------------------------------------
create or replace function public.trg_deployment_dates()
returns trigger language plpgsql as $$
begin
  if NEW.status::text = 'active' and NEW.activated_at is null then NEW.activated_at := now(); end if;
  if NEW.status::text in ('terminated','completed') and NEW.ended_at is null then NEW.ended_at := now(); end if;
  if NEW.status::text = 'active' and NEW.start_date is null then NEW.start_date := current_date; end if;
  return NEW;
end $$;

drop trigger if exists deployment_dates on public.deployments;
create trigger deployment_dates before insert or update on public.deployments
for each row execute function public.trg_deployment_dates();

create or replace function public.trg_deployment_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_emp_user uuid; v_biz text; v_est text; v_changed boolean := false;
  v_e_head text; v_e_body text; v_r_head text; v_r_body text; v_start text; v_app_status text;
begin
  if TG_OP = 'INSERT' then v_changed := true;
  else
    v_changed := NEW.status is distinct from OLD.status
      or NEW.employer_id is distinct from OLD.employer_id
      or NEW.establishment_id is distinct from OLD.establishment_id
      or NEW.role_title is distinct from OLD.role_title;
  end if;
  if not v_changed then return NEW; end if;

  select user_id, business_name into v_emp_user, v_biz from public.employer_profiles where id = NEW.employer_id;
  select name into v_est from public.establishments where id = NEW.establishment_id;
  v_start := case when NEW.start_date is null then 'to be confirmed' else to_char(NEW.start_date, 'DD Mon YYYY') end;

  -- keep the recruitment record in sync
  v_app_status := case NEW.status::text
    when 'active' then 'employed' when 'onboarding' then 'onboarding'
    when 'selected' then 'selected' when 'pending_start' then 'selected' else null end;
  if NEW.application_id is not null and v_app_status is not null then
    update public.job_applications set status = v_app_status::public.application_status
    where id = NEW.application_id and status::text <> v_app_status;
  end if;

  case NEW.status::text
    when 'active' then
      v_e_head := 'Your employment is now active';
      v_e_body := 'You are now employed as ' || NEW.role_title || ' at ' || coalesce(v_est,'your establishment') || ' (' || coalesce(v_biz,'employer') || '). Start date: ' || v_start || '. Attendance, payroll and employment records are available in your workspace.';
      v_r_head := 'New staff member is active';
      v_r_body := coalesce((select full_name from public.profiles where id = NEW.employee_id),'A staff member') || ' is now active as ' || NEW.role_title || ' at ' || coalesce(v_est,'your establishment') || '.';
    when 'selected', 'pending_start', 'onboarding' then
      v_e_head := 'Your placement has been confirmed';
      v_e_body := 'You have been placed as ' || NEW.role_title || ' at ' || coalesce(v_est,'an establishment') || ' (' || coalesce(v_biz,'employer') || '). Start date: ' || v_start || '. Complete any onboarding documents on your Documents page.';
      v_r_head := 'Staff member assigned to you';
      v_r_body := coalesce((select full_name from public.profiles where id = NEW.employee_id),'A staff member') || ' has been assigned as ' || NEW.role_title || ' at ' || coalesce(v_est,'your establishment') || ' (start: ' || v_start || ').';
    when 'suspended' then
      v_e_head := 'Your employment has been suspended'; v_e_body := 'Your employment as ' || NEW.role_title || ' has been suspended. Please contact HR for details.';
      v_r_head := 'Staff member suspended'; v_r_body := coalesce((select full_name from public.profiles where id = NEW.employee_id),'A staff member') || ' (' || NEW.role_title || ') has been suspended.';
    when 'on_leave' then
      v_e_head := 'You are on leave'; v_e_body := 'Your employment status as ' || NEW.role_title || ' is now: on leave.';
      v_r_head := 'Staff member on leave'; v_r_body := coalesce((select full_name from public.profiles where id = NEW.employee_id),'A staff member') || ' (' || NEW.role_title || ') is now on leave.';
    when 'terminated' then
      v_e_head := 'Your employment has ended'; v_e_body := 'Your employment as ' || NEW.role_title || ' at ' || coalesce(v_biz,'the employer') || ' has ended.';
      v_r_head := 'Staff member removed'; v_r_body := coalesce((select full_name from public.profiles where id = NEW.employee_id),'A staff member') || ' (' || NEW.role_title || ') is no longer deployed to you.';
    when 'completed' then
      v_e_head := 'Your placement is complete'; v_e_body := 'Your placement as ' || NEW.role_title || ' at ' || coalesce(v_biz,'the employer') || ' is now complete.';
      v_r_head := 'Placement completed'; v_r_body := coalesce((select full_name from public.profiles where id = NEW.employee_id),'A staff member') || ' (' || NEW.role_title || ') has completed their placement.';
    else return NEW;
  end case;

  if NEW.hr_message is not null and length(trim(NEW.hr_message)) > 0
     and (TG_OP = 'INSERT' or NEW.hr_message is distinct from OLD.hr_message or NEW.status is distinct from OLD.status) then
    v_e_body := v_e_body || E'\n\nMessage from HR: ' || NEW.hr_message;
  end if;

  perform public.notify_user(NEW.employee_id, 'employment', v_e_head, v_e_body, '/employee/employment',
    jsonb_build_object('deployment_id', NEW.id, 'status', NEW.status));
  perform public.notify_user(v_emp_user, 'deployment', v_r_head, v_r_body, '/employer/employees/' || NEW.id,
    jsonb_build_object('deployment_id', NEW.id, 'status', NEW.status));
  return NEW;
end $$;

drop trigger if exists deployment_change_notify on public.deployments;
create trigger deployment_change_notify after insert or update on public.deployments
for each row execute function public.trg_deployment_change();

-- ---------------------------------------------------------------------------
-- 9. Default establishment per employer + auto-fill on job openings
-- ---------------------------------------------------------------------------
create or replace function public.trg_employer_default_establishment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.establishments(employer_id, name, address, is_default)
    values (NEW.id, NEW.business_name || ' - Main Office', coalesce(nullif(trim(NEW.business_address),''), 'Address to be updated'), true);
  else
    if NEW.business_address is not null and length(trim(NEW.business_address)) > 0 then
      update public.establishments set address = NEW.business_address
      where employer_id = NEW.id and is_default and address = 'Address to be updated';
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists employer_default_establishment on public.employer_profiles;
create trigger employer_default_establishment after insert or update of business_address on public.employer_profiles
for each row execute function public.trg_employer_default_establishment();

-- Back-fill: every existing employer with no establishment gets a default one.
insert into public.establishments(employer_id, name, address, is_default)
select ep.id, ep.business_name || ' - Main Office', coalesce(nullif(trim(ep.business_address),''), 'Address to be updated'), true
from public.employer_profiles ep
where not exists (select 1 from public.establishments e where e.employer_id = ep.id);

-- Existing jobs that were created for an employer without an establishment.
update public.job_openings jo
set establishment_id = (select e.id from public.establishments e where e.employer_id = jo.employer_id order by e.is_default desc, e.created_at limit 1)
where jo.employer_id is not null and jo.establishment_id is null;

create or replace function public.trg_job_default_establishment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.employer_id is not null and NEW.establishment_id is null then
    select e.id into NEW.establishment_id from public.establishments e
    where e.employer_id = NEW.employer_id and e.is_active
    order by e.is_default desc, e.created_at limit 1;
  end if;
  return NEW;
end $$;

drop trigger if exists job_default_establishment on public.job_openings;
create trigger job_default_establishment before insert on public.job_openings
for each row execute function public.trg_job_default_establishment();

-- ---------------------------------------------------------------------------
-- 10. Staffing requests / job lifecycle notifications
-- ---------------------------------------------------------------------------
create or replace function public.trg_job_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role public.user_role; v_emp_user uuid; v_biz text; v_est text;
begin
  if NEW.employer_id is null then return NEW; end if;
  select user_id, business_name into v_emp_user, v_biz from public.employer_profiles where id = NEW.employer_id;
  select name into v_est from public.establishments where id = NEW.establishment_id;
  select role into v_role from public.profiles where id = NEW.created_by;

  if TG_OP = 'INSERT' then
    if v_role = 'employer' and NEW.status::text = 'draft' then
      perform public.notify_admins('staff_request', 'New staffing request from ' || coalesce(v_biz,'an employer'),
        coalesce(v_biz,'An employer') || ' requested ' || NEW.positions_available || ' x ' || NEW.title ||
        coalesce(' at ' || v_est, '') || '. Review it under Jobs and publish it to start recruiting.',
        '/admin/jobs', jsonb_build_object('job_id', NEW.id));
      perform public.notify_user(v_emp_user, 'staff_request', 'Staffing request submitted',
        'Your request for ' || NEW.positions_available || ' x ' || NEW.title || ' has been sent to HR. We will update you once it is reviewed.',
        '/employer/jobs', jsonb_build_object('job_id', NEW.id));
    elsif v_role = 'admin' and NEW.status::text = 'published' then
      perform public.notify_user(v_emp_user, 'job', 'New job opening published for you',
        'HR published "' || NEW.title || '" for ' || coalesce(v_est,'your establishment') || '. Candidates can now apply.',
        '/employer/jobs', jsonb_build_object('job_id', NEW.id));
    end if;
  elsif NEW.status is distinct from OLD.status then
    if NEW.status::text = 'published' then
      perform public.notify_user(v_emp_user, 'job', 'Your staffing request is now live',
        '"' || NEW.title || '" has been approved and published. HR is now receiving applications.',
        '/employer/jobs', jsonb_build_object('job_id', NEW.id));
    elsif NEW.status::text in ('closed','archived','paused') then
      perform public.notify_user(v_emp_user, 'job', 'Job opening ' || NEW.status::text,
        '"' || NEW.title || '" is now ' || NEW.status::text || '.', '/employer/jobs', jsonb_build_object('job_id', NEW.id));
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists job_notify on public.job_openings;
create trigger job_notify after insert or update of status on public.job_openings
for each row execute function public.trg_job_notify();

-- ---------------------------------------------------------------------------
-- 11. Hire -> deployment conversion (the missing "employ this applicant" step)
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_deployment(
  p_application_id uuid,
  p_employer_id uuid,
  p_establishment_id uuid,
  p_role_title text,
  p_agreed_salary numeric default 0,
  p_start_date date default null,
  p_status public.employment_status default 'active',
  p_message text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_app record; v_id uuid;
begin
  if not public.is_admin() then raise exception 'Only administrators can assign staff to employers.'; end if;
  select id, applicant_id into v_app from public.job_applications where id = p_application_id;
  if not found then raise exception 'Application not found.'; end if;
  if not exists (select 1 from public.establishments where id = p_establishment_id and employer_id = p_employer_id) then
    raise exception 'The selected establishment does not belong to the selected employer.';
  end if;
  if coalesce(trim(p_role_title),'') = '' then raise exception 'Role title is required.'; end if;

  insert into public.deployments(application_id, employee_id, employer_id, establishment_id, role_title,
                                 agreed_salary, status, start_date, hr_message, created_by)
  values (p_application_id, v_app.applicant_id, p_employer_id, p_establishment_id, trim(p_role_title),
          coalesce(p_agreed_salary,0), p_status, p_start_date, nullif(trim(coalesce(p_message,'')),''), auth.uid())
  on conflict (application_id) do update set
    employer_id = excluded.employer_id,
    establishment_id = excluded.establishment_id,
    role_title = excluded.role_title,
    agreed_salary = excluded.agreed_salary,
    status = excluded.status,
    start_date = excluded.start_date,
    hr_message = excluded.hr_message
  returning id into v_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'assign_deployment', 'deployment', v_id,
          jsonb_build_object('application_id', p_application_id, 'employer_id', p_employer_id,
                             'establishment_id', p_establishment_id, 'status', p_status));
  return v_id;
end $$;

revoke all on function public.admin_assign_deployment(uuid,uuid,uuid,text,numeric,date,public.employment_status,text) from public, anon;
grant execute on function public.admin_assign_deployment(uuid,uuid,uuid,text,numeric,date,public.employment_status,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Realtime for the notification bell
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- OPTIONAL: deliver queued emails every minute even if nobody triggers a send
-- (needs the pg_cron + pg_net extensions and the function deployed).
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY>, then uncomment.
-- ---------------------------------------------------------------------------
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('enigtee-send-emails', '* * * * *', $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-notification-emails',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
--     body := '{}'::jsonb);
-- $$);
