-- ============================================================================
-- EnigteeWorld ATTENDANCE / PAYROLL / INVOICE PATCH
-- Run ONCE in the Supabase SQL Editor, after workflow-patch.sql. Idempotent.
--
-- Implements the "Attendance, Payroll & Invoice Rules" planning spec:
--   - Deployment carries its own pay basis + billing-fee configuration,
--     separate from the original job-opening salary.
--   - Employment schedules (fixed / selected days / rotating / overnight),
--     versioned so a schedule change never rewrites historical payroll.
--   - Establishment-linked QR attendance points admin/employer can create,
--     activate/deactivate and regenerate; employee scan -> pending_confirmation
--     -> employer confirms/rejects; employer manual check-in for phone/network
--     issues, fully audited.
--   - Structured payroll adjustments (overtime/allowance/bonus/deduction) with
--     an approval workflow, feeding into payroll runs.
--   - Payroll runs calculated from confirmed attendance + approved adjustments
--     using the deployment's own agreed terms - never the job-opening salary.
--   - Configurable platform fee (default NGN 15,000 per active deployment,
--     admin can change/disable, with employer/deployment-level overrides).
--   - Invoices generated from approved payroll, itemised (salary line +
--     platform-fee line per deployment), immutable once issued except through
--     payments; employer submits a payment claim, admin confirms it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Deployment: pay basis + billing fee configuration (spec §1, §8, §12)
-- ---------------------------------------------------------------------------
alter table public.deployments add column if not exists pay_basis text not null default 'monthly'
  check (pay_basis in ('monthly','daily','hourly','per_shift','custom'));
alter table public.deployments add column if not exists billing_fee_enabled boolean not null default true;
alter table public.deployments add column if not exists billing_fee_override numeric(12,2);

comment on column public.deployments.billing_fee_override is
  'Per-deployment override of the platform fee. Null = use the employer override, or the platform default.';

alter table public.employer_profiles add column if not exists billing_fee_override numeric(12,2);
comment on column public.employer_profiles.billing_fee_override is
  'Per-employer override of the platform fee. Null = use the platform default.';

-- ---------------------------------------------------------------------------
-- 1. Employment schedules (spec §7) - versioned, never rewritten
-- ---------------------------------------------------------------------------
create table if not exists public.employment_schedules (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  schedule_type text not null default 'fixed_weekdays'
    check (schedule_type in ('fixed_weekdays','all_week','selected_days','rotating','custom')),
  working_days smallint[] not null default '{1,2,3,4,5}', -- 0=Sunday .. 6=Saturday
  expected_hours numeric(5,2) not null default 8,
  shift_start time,
  shift_end time,
  overnight boolean not null default false,
  grace_minutes integer not null default 15,
  timezone text not null default 'Africa/Lagos',
  effective_from date not null default current_date,
  effective_to date,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_schedules_deployment on public.employment_schedules(deployment_id, effective_from desc);

-- ---------------------------------------------------------------------------
-- 2. Attendance points / QR (spec §2, §3)
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_points (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  employer_id uuid not null references public.employer_profiles(id) on delete cascade,
  name text not null default 'Main entrance',
  qr_token text not null unique default upper(substr(encode(gen_random_bytes(6),'hex'),1,10)),
  is_active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_attendance_points_establishment on public.attendance_points(establishment_id);

-- ---------------------------------------------------------------------------
-- 3. Attendance sessions (spec §4, §5, §6) - extends the existing table so
--    it becomes a work-session model: multiple rows per employee per day.
-- ---------------------------------------------------------------------------
alter table public.attendance_events drop constraint if exists attendance_events_deployment_id_attendance_date_key;

alter table public.attendance_events add column if not exists attendance_point_id uuid references public.attendance_points(id);
alter table public.attendance_events add column if not exists confirmation_status text not null default 'pending_confirmation'
  check (confirmation_status in ('pending_confirmation','confirmed','rejected','expired','cancelled'));
alter table public.attendance_events add column if not exists confirmed_by uuid references public.profiles(id);
alter table public.attendance_events add column if not exists confirmed_at timestamptz;
alter table public.attendance_events add column if not exists reason text;
alter table public.attendance_events add column if not exists notes text;
alter table public.attendance_events add column if not exists created_by uuid references public.profiles(id);
alter table public.attendance_events add column if not exists edited_by uuid references public.profiles(id);
alter table public.attendance_events add column if not exists edit_reason text;
alter table public.attendance_events add column if not exists payroll_item_id uuid;

comment on column public.attendance_events.source is
  'Check-in method: qr (employee scan), employer_manual, or admin_manual.';
comment on column public.attendance_events.status is
  'Classification once reviewed: present / late / absent / approved_leave / unapproved_absence / pending_review / corrected.';

create index if not exists idx_attendance_deployment_date on public.attendance_events(deployment_id, attendance_date desc);
create index if not exists idx_attendance_confirmation on public.attendance_events(confirmation_status);

-- ---------------------------------------------------------------------------
-- 4. Payroll adjustments (spec §10) - overtime / allowance / bonus / deduction
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  payroll_run_id uuid references public.payroll_runs(id) on delete set null,
  category text not null check (category in ('overtime','allowance','bonus','deduction','other')),
  amount numeric(12,2) not null check (amount >= 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  proposed_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  employee_acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_adjustments_deployment on public.payroll_adjustments(deployment_id, status);

-- ---------------------------------------------------------------------------
-- 5. Payroll runs / items extensions (spec §9, §11)
-- ---------------------------------------------------------------------------
alter table public.payroll_runs add column if not exists employer_id uuid references public.employer_profiles(id);
alter table public.payroll_runs add column if not exists locked_at timestamptz;
alter table public.payroll_runs add column if not exists notes text;
comment on column public.payroll_runs.employer_id is 'Null = platform-wide run covering every employer.';

alter table public.payroll_items add column if not exists pay_basis text;
alter table public.payroll_items add column if not exists days_expected integer;
alter table public.payroll_items add column if not exists days_present integer default 0;
alter table public.payroll_items add column if not exists hours_worked numeric(8,2);
alter table public.payroll_items add column if not exists overtime_amount numeric(12,2) not null default 0;
alter table public.payroll_items add column if not exists allowance_amount numeric(12,2) not null default 0;
alter table public.payroll_items add column if not exists calculation_notes text;

-- ---------------------------------------------------------------------------
-- 6. Platform fee settings (spec, billing rule) - admin configurable
-- ---------------------------------------------------------------------------
create table if not exists public.platform_fee_settings (
  id uuid primary key default gen_random_uuid(),
  default_fee numeric(12,2) not null default 15000,
  is_enabled boolean not null default true,
  effective_from date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
insert into public.platform_fee_settings(default_fee, is_enabled, effective_from)
select 15000, true, current_date
where not exists (select 1 from public.platform_fee_settings);

create or replace function public.current_platform_fee_setting()
returns public.platform_fee_settings language sql stable as $$
  select * from public.platform_fee_settings
  where effective_from <= current_date
  order by effective_from desc, created_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 7. Invoice items: line-item kind (spec §12, §13)
-- ---------------------------------------------------------------------------
alter table public.invoice_items add column if not exists kind text not null default 'adjustment'
  check (kind in ('salary','platform_fee','adjustment','credit'));
alter table public.invoice_items add column if not exists payroll_item_id uuid references public.payroll_items(id);

alter table public.invoices add column if not exists payroll_run_id uuid references public.payroll_runs(id);
alter table public.invoices add column if not exists notes text;

-- ---------------------------------------------------------------------------
-- 8. Invoice payments (spec §14) - claim + admin confirmation, never a bare button
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_reference text not null,
  paid_on date not null,
  note text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  submitted_by uuid not null references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoice_payments_invoice on public.invoice_payments(invoice_id);

-- ---------------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------------
alter table public.employment_schedules enable row level security;
alter table public.attendance_points enable row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.platform_fee_settings enable row level security;
alter table public.invoice_payments enable row level security;

create or replace function public.owns_establishment(eid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.establishments e join public.employer_profiles ep on ep.id = e.employer_id
    where e.id = eid and ep.user_id = auth.uid()
  );
$$;

create or replace function public.owns_deployment_employer(did uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.deployments d join public.employer_profiles ep on ep.id = d.employer_id
    where d.id = did and ep.user_id = auth.uid()
  );
$$;

drop policy if exists "schedule access" on public.employment_schedules;
create policy "schedule access" on public.employment_schedules for select using (
  public.is_admin()
  or deployment_id in (select id from public.deployments where employee_id = auth.uid())
  or deployment_id in (select id from public.deployments where public.owns_deployment_employer(id))
);
drop policy if exists "admin manage schedules" on public.employment_schedules;
create policy "admin manage schedules" on public.employment_schedules for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "attendance point access" on public.attendance_points;
create policy "attendance point access" on public.attendance_points for select using (
  public.is_admin() or public.owns_establishment(establishment_id)
  or establishment_id in (select establishment_id from public.deployments where employee_id = auth.uid())
);
drop policy if exists "admin manage attendance points" on public.attendance_points;
create policy "admin manage attendance points" on public.attendance_points for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "employer manage own attendance points" on public.attendance_points;
create policy "employer manage own attendance points" on public.attendance_points for all
using (public.owns_establishment(establishment_id)) with check (public.owns_establishment(establishment_id));

drop policy if exists "adjustment access" on public.payroll_adjustments;
create policy "adjustment access" on public.payroll_adjustments for select using (
  public.is_admin()
  or deployment_id in (select id from public.deployments where employee_id = auth.uid())
  or public.owns_deployment_employer(deployment_id)
);
drop policy if exists "employer propose adjustment" on public.payroll_adjustments;
create policy "employer propose adjustment" on public.payroll_adjustments for insert
with check (public.owns_deployment_employer(deployment_id) or public.is_admin());
drop policy if exists "admin manage adjustments" on public.payroll_adjustments;
create policy "admin manage adjustments" on public.payroll_adjustments for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "fee settings readable" on public.platform_fee_settings;
create policy "fee settings readable" on public.platform_fee_settings for select using (public.is_admin());
drop policy if exists "admin manage fee settings" on public.platform_fee_settings;
create policy "admin manage fee settings" on public.platform_fee_settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "payment access" on public.invoice_payments;
create policy "payment access" on public.invoice_payments for select using (
  public.is_admin()
  or invoice_id in (select id from public.invoices where employer_id in (select id from public.employer_profiles where user_id = auth.uid()))
);
drop policy if exists "employer submit payment" on public.invoice_payments;
create policy "employer submit payment" on public.invoice_payments for insert with check (
  invoice_id in (select id from public.invoices where employer_id in (select id from public.employer_profiles where user_id = auth.uid()))
  or public.is_admin()
);
drop policy if exists "admin manage payments" on public.invoice_payments;
create policy "admin manage payments" on public.invoice_payments for update using (public.is_admin()) with check (public.is_admin());

-- Employer can view their own deployments' payroll items now that pay_basis etc exist (policy already exists in workflow-patch/base schema).
-- Employer can view their own establishments' attendance_points via policy above; employee can view their own deployment's schedule.

-- ---------------------------------------------------------------------------
-- 10. Attendance point management RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_attendance_point(p_establishment_id uuid, p_name text default 'Main entrance')
returns public.attendance_points language plpgsql security definer set search_path = public as $$
declare v_row public.attendance_points;
begin
  if not (public.is_admin() or public.owns_establishment(p_establishment_id)) then
    raise exception 'You do not have access to this establishment.';
  end if;
  insert into public.attendance_points(establishment_id, employer_id, name, created_by)
  values (p_establishment_id, (select employer_id from public.establishments where id = p_establishment_id), coalesce(nullif(trim(p_name),''),'Main entrance'), auth.uid())
  returning * into v_row;
  return v_row;
end $$;
grant execute on function public.create_attendance_point(uuid, text) to authenticated;

create or replace function public.set_attendance_point_status(p_point_id uuid, p_is_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_establishment uuid;
begin
  select establishment_id into v_establishment from public.attendance_points where id = p_point_id;
  if v_establishment is null then raise exception 'Attendance point not found.'; end if;
  if not (public.is_admin() or public.owns_establishment(v_establishment)) then
    raise exception 'You do not have access to this attendance point.';
  end if;
  update public.attendance_points set is_active = p_is_active, updated_at = now() where id = p_point_id;
end $$;
grant execute on function public.set_attendance_point_status(uuid, boolean) to authenticated;

create or replace function public.regenerate_attendance_point(p_point_id uuid)
returns public.attendance_points language plpgsql security definer set search_path = public as $$
declare v_establishment uuid; v_row public.attendance_points;
begin
  select establishment_id into v_establishment from public.attendance_points where id = p_point_id;
  if v_establishment is null then raise exception 'Attendance point not found.'; end if;
  if not (public.is_admin() or public.owns_establishment(v_establishment)) then
    raise exception 'You do not have access to this attendance point.';
  end if;
  update public.attendance_points
  set qr_token = upper(substr(encode(gen_random_bytes(6),'hex'),1,10)), updated_at = now()
  where id = p_point_id
  returning * into v_row;
  return v_row;
end $$;
grant execute on function public.regenerate_attendance_point(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Employee QR scan (spec §2, §4)
-- ---------------------------------------------------------------------------
create or replace function public.employee_attendance_scan(p_token text)
returns public.attendance_events language plpgsql security definer set search_path = public as $$
declare
  v_point public.attendance_points;
  v_deployment public.deployments;
  v_open public.attendance_events;
  v_row public.attendance_events;
begin
  select * into v_point from public.attendance_points where qr_token = upper(trim(p_token));
  if v_point is null then raise exception 'This attendance code was not recognised. Ask your supervisor for the current code.'; end if;
  if not v_point.is_active then raise exception 'This attendance point is not active. Ask your supervisor for the current code.'; end if;
  if v_point.expires_at is not null and v_point.expires_at < now() then raise exception 'This attendance code has expired. Ask your supervisor for the current code.'; end if;

  select * into v_deployment from public.deployments
  where employee_id = auth.uid() and establishment_id = v_point.establishment_id
    and status in ('active','pending_start','onboarding')
  order by (status = 'active') desc limit 1;
  if v_deployment is null then
    raise exception 'You do not have an active deployment at this establishment.';
  end if;

  select * into v_open from public.attendance_events
  where deployment_id = v_deployment.id and attendance_date = current_date and check_out_at is null
  order by created_at desc limit 1;

  if v_open is not null then
    update public.attendance_events
    set check_out_at = now()
    where id = v_open.id
    returning * into v_row;
    return v_row;
  end if;

  insert into public.attendance_events(
    deployment_id, employee_id, establishment_id, attendance_date, check_in_at,
    status, source, attendance_point_id, confirmation_status, created_by
  ) values (
    v_deployment.id, auth.uid(), v_point.establishment_id, current_date, now(),
    'pending_review', 'qr', v_point.id, 'pending_confirmation', auth.uid()
  ) returning * into v_row;
  return v_row;
end $$;
grant execute on function public.employee_attendance_scan(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Employer confirm / reject + manual check-in (spec §4, §5)
-- ---------------------------------------------------------------------------
create or replace function public.review_attendance(p_event_id uuid, p_action text, p_status text default 'present', p_notes text default null)
returns public.attendance_events language plpgsql security definer set search_path = public as $$
declare v_establishment uuid; v_row public.attendance_events;
begin
  if p_action not in ('confirm','reject') then raise exception 'Unknown review action.'; end if;
  select establishment_id into v_establishment from public.attendance_events where id = p_event_id;
  if v_establishment is null then raise exception 'Attendance record not found.'; end if;
  if not (public.is_admin() or public.owns_establishment(v_establishment)) then
    raise exception 'You do not have access to this attendance record.';
  end if;

  update public.attendance_events set
    confirmation_status = case p_action when 'confirm' then 'confirmed' else 'rejected' end,
    status = case when p_action = 'confirm' then p_status::public.attendance_status else 'unapproved_absence' end,
    confirmed_by = auth.uid(),
    confirmed_at = now(),
    notes = coalesce(nullif(trim(p_notes),''), notes)
  where id = p_event_id
  returning * into v_row;

  perform public.notify_user(v_row.employee_id,
    'attendance',
    case when p_action = 'confirm' then 'Attendance confirmed' else 'Attendance rejected' end,
    case when p_action = 'confirm'
      then 'Your attendance on ' || to_char(v_row.attendance_date,'DD Mon YYYY') || ' was confirmed as ' || replace(v_row.status::text,'_',' ') || '.'
      else 'Your attendance on ' || to_char(v_row.attendance_date,'DD Mon YYYY') || ' was not confirmed.' || case when p_notes is not null then E'\n\nNote: ' || p_notes else '' end
    end,
    '/employee/attendance');

  return v_row;
end $$;
grant execute on function public.review_attendance(uuid, text, text, text) to authenticated;

create or replace function public.employer_manual_checkin(
  p_deployment_id uuid, p_work_date date, p_check_in_at timestamptz, p_check_out_at timestamptz default null,
  p_reason text default 'Employee unable to scan', p_notes text default null
) returns public.attendance_events language plpgsql security definer set search_path = public as $$
declare v_deployment public.deployments; v_row public.attendance_events; v_admin_note boolean;
begin
  select * into v_deployment from public.deployments where id = p_deployment_id;
  if v_deployment is null then raise exception 'Deployment not found.'; end if;
  if not (public.is_admin() or public.owns_deployment_employer(p_deployment_id)) then
    raise exception 'You do not have access to this deployment.';
  end if;
  if v_deployment.status not in ('active','pending_start','onboarding') then
    raise exception 'This employee does not have an active deployment.';
  end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required for a manual check-in.'; end if;

  v_admin_note := p_work_date < current_date - interval '2 days';

  insert into public.attendance_events(
    deployment_id, employee_id, establishment_id, attendance_date, check_in_at, check_out_at,
    status, source, confirmation_status, confirmed_by, confirmed_at, reason, notes, created_by
  ) values (
    p_deployment_id, v_deployment.employee_id, v_deployment.establishment_id, p_work_date, p_check_in_at, p_check_out_at,
    case when v_admin_note and not public.is_admin() then 'pending_review' else 'present' end,
    case when public.is_admin() then 'admin_manual' else 'employer_manual' end,
    case when v_admin_note and not public.is_admin() then 'pending_confirmation' else 'confirmed' end,
    auth.uid(), now(), p_reason, p_notes, auth.uid()
  ) returning * into v_row;

  perform public.notify_user(v_row.employee_id, 'attendance', 'Attendance recorded for you',
    'A manual attendance entry for ' || to_char(v_row.attendance_date,'DD Mon YYYY') || ' was recorded by your employer. Reason: ' || p_reason,
    '/employee/attendance');

  if v_admin_note and not public.is_admin() then
    perform public.notify_admins('attendance', 'Retroactive manual attendance needs review',
      'A manual attendance entry more than 2 days in the past was submitted and needs admin review.', '/admin/attendance');
  end if;

  return v_row;
end $$;
grant execute on function public.employer_manual_checkin(uuid, date, timestamptz, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Payroll adjustments: propose / review (spec §10)
-- ---------------------------------------------------------------------------
create or replace function public.propose_payroll_adjustment(p_deployment_id uuid, p_category text, p_amount numeric, p_reason text)
returns public.payroll_adjustments language plpgsql security definer set search_path = public as $$
declare v_row public.payroll_adjustments;
begin
  if not (public.is_admin() or public.owns_deployment_employer(p_deployment_id)) then
    raise exception 'You do not have access to this deployment.';
  end if;
  if p_amount <= 0 then raise exception 'Amount must be greater than zero.'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required.'; end if;

  insert into public.payroll_adjustments(deployment_id, category, amount, reason, proposed_by, status)
  values (p_deployment_id, p_category, p_amount,trim(p_reason), auth.uid(), case when public.is_admin() then 'approved' else 'pending' end)
  returning * into v_row;

  if v_row.status = 'approved' then
    update public.payroll_adjustments set approved_by = auth.uid(), approved_at = now() where id = v_row.id returning * into v_row;
  else
    perform public.notify_admins('payroll', 'New payroll adjustment proposed',
      'A ' || p_category || ' of ' || to_char(p_amount,'FM999,999,990') || ' was proposed for review.', '/admin/payroll');
  end if;

  return v_row;
end $$;
grant execute on function public.propose_payroll_adjustment(uuid, text, numeric, text) to authenticated;

create or replace function public.review_payroll_adjustment(p_adjustment_id uuid, p_action text)
returns public.payroll_adjustments language plpgsql security definer set search_path = public as $$
declare v_row public.payroll_adjustments;
begin
  if not public.is_admin() then raise exception 'Only administrators can review payroll adjustments.'; end if;
  if p_action not in ('approve','reject') then raise exception 'Unknown action.'; end if;

  update public.payroll_adjustments set
    status = case p_action when 'approve' then 'approved' else 'rejected' end,
    approved_by = auth.uid(), approved_at = now()
  where id = p_adjustment_id and status = 'pending'
  returning * into v_row;

  if v_row is null then raise exception 'Adjustment not found or already reviewed.'; end if;
  return v_row;
end $$;
grant execute on function public.review_payroll_adjustment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 14. Payroll run generation, approval (spec §9, §11)
-- ---------------------------------------------------------------------------
create or replace function public.admin_run_payroll(p_period_start date, p_period_end date, p_employer_id uuid default null)
returns public.payroll_runs language plpgsql security definer set search_path = public as $$
declare
  v_run public.payroll_runs;
  v_dep record;
  v_days_present integer;
  v_hours numeric;
  v_base numeric;
  v_overtime numeric;
  v_allowance numeric;
  v_deductions numeric;
  v_net numeric;
  v_notes text;
begin
  if not public.is_admin() then raise exception 'Only administrators can run payroll.'; end if;
  if p_period_end < p_period_start then raise exception 'Period end must be after period start.'; end if;

  insert into public.payroll_runs(period_start, period_end, employer_id, status, created_by)
  values (p_period_start, p_period_end, p_employer_id, 'calculating', auth.uid())
  returning * into v_run;

  for v_dep in
    select d.* from public.deployments d
    where d.status in ('active','on_leave')
      and (p_employer_id is null or d.employer_id = p_employer_id)
      and d.start_date is not null and d.start_date <= p_period_end
      and (d.end_date is null or d.end_date >= p_period_start)
  loop
    select count(*) filter (where status in ('present','late')), coalesce(sum(extract(epoch from (check_out_at - check_in_at))/3600.0),0)
      into v_days_present, v_hours
    from public.attendance_events
    where deployment_id = v_dep.id and confirmation_status = 'confirmed'
      and attendance_date between p_period_start and p_period_end;

    v_base := case v_dep.pay_basis
      when 'daily' then v_dep.agreed_salary * coalesce(v_days_present,0)
      when 'hourly' then v_dep.agreed_salary * coalesce(v_hours,0)
      when 'per_shift' then v_dep.agreed_salary * coalesce(v_days_present,0)
      else v_dep.agreed_salary -- monthly: fixed unless a deployment-specific policy overrides (spec §8 default)
    end;

    select coalesce(sum(amount) filter (where category = 'overtime'),0),
           coalesce(sum(amount) filter (where category in ('allowance','bonus')),0),
           coalesce(sum(amount) filter (where category = 'deduction'),0)
      into v_overtime, v_allowance, v_deductions
    from public.payroll_adjustments
    where deployment_id = v_dep.id and status = 'approved' and payroll_run_id is null;

    v_net := v_base + v_overtime + v_allowance - v_deductions;
    v_notes := 'Base pay (' || v_dep.pay_basis || '): ' || to_char(v_base,'FM999,999,990') ||
      case when v_overtime > 0 then ' + overtime ' || to_char(v_overtime,'FM999,999,990') else '' end ||
      case when v_allowance > 0 then ' + allowances/bonus ' || to_char(v_allowance,'FM999,999,990') else '' end ||
      case when v_deductions > 0 then ' - deductions ' || to_char(v_deductions,'FM999,999,990') else '' end ||
      '. Confirmed attendance: ' || coalesce(v_days_present,0) || ' day(s), ' || to_char(coalesce(v_hours,0),'FM999,990.0') || ' hour(s).';

    insert into public.payroll_items(
      payroll_run_id, deployment_id, employee_id, employer_id, salary_snapshot, days_present, deductions, bonuses,
      net_pay, payment_status, pay_basis, days_expected, hours_worked, overtime_amount, allowance_amount, calculation_notes
    ) values (
      v_run.id, v_dep.id, v_dep.employee_id, v_dep.employer_id, v_base, coalesce(v_days_present,0), v_deductions,
      v_overtime + v_allowance, greatest(v_net,0), 'pending', v_dep.pay_basis, null, coalesce(v_hours,0), v_overtime, v_allowance, v_notes
    )
    on conflict (payroll_run_id, deployment_id) do nothing;

    update public.payroll_adjustments set payroll_run_id = v_run.id
    where deployment_id = v_dep.id and status = 'approved' and payroll_run_id is null;
  end loop;

  update public.payroll_runs set status = 'calculated', updated_at = now() where id = v_run.id returning * into v_run;
  return v_run;
end $$;
grant execute on function public.admin_run_payroll(date, date, uuid) to authenticated;

create or replace function public.admin_approve_payroll(p_run_id uuid)
returns public.payroll_runs language plpgsql security definer set search_path = public as $$
declare v_run public.payroll_runs;
begin
  if not public.is_admin() then raise exception 'Only administrators can approve payroll.'; end if;
  update public.payroll_runs set status = 'approved', approved_by = auth.uid(), locked_at = now(), updated_at = now()
  where id = p_run_id and status = 'calculated'
  returning * into v_run;
  if v_run is null then raise exception 'Payroll run not found or not ready to approve.'; end if;

  perform public.notify_user(pi.employee_id, 'payroll', 'Payroll approved',
    'Your pay for ' || to_char(v_run.period_start,'DD Mon') || ' - ' || to_char(v_run.period_end,'DD Mon YYYY') ||
    ' has been approved: ' || to_char(pi.net_pay,'FM999,999,990') || '.', '/employee/payroll')
  from public.payroll_items pi where pi.payroll_run_id = v_run.id;

  return v_run;
end $$;
grant execute on function public.admin_approve_payroll(uuid) to authenticated;

-- Approved/locked payroll items become immutable.
create or replace function public.trg_lock_payroll_items()
returns trigger language plpgsql as $$
declare v_status text;
begin
  select status into v_status from public.payroll_runs where id = coalesce(new.payroll_run_id, old.payroll_run_id);
  if v_status in ('approved','paid') and not public.is_admin() then
    raise exception 'This payroll run is approved and locked.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists lock_payroll_items on public.payroll_items;
create trigger lock_payroll_items before update or delete on public.payroll_items
for each row execute function public.trg_lock_payroll_items();

-- ---------------------------------------------------------------------------
-- 15. Invoice generation, issuing, payments (spec §12, §13, §14)
-- ---------------------------------------------------------------------------
create or replace function public.admin_generate_invoice(p_run_id uuid, p_employer_id uuid, p_due_date date default null)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare
  v_run public.payroll_runs;
  v_invoice public.invoices;
  v_item record;
  v_fee numeric;
  v_fee_enabled boolean;
  v_subtotal numeric := 0;
  v_fees numeric := 0;
  v_setting public.platform_fee_settings;
begin
  if not public.is_admin() then raise exception 'Only administrators can generate invoices.'; end if;
  select * into v_run from public.payroll_runs where id = p_run_id;
  if v_run is null or v_run.status not in ('approved','paid') then
    raise exception 'Payroll must be approved before an invoice can be generated.';
  end if;
  if exists (select 1 from public.invoices where payroll_run_id = p_run_id and employer_id = p_employer_id) then
    raise exception 'An invoice already exists for this employer and payroll run.';
  end if;

  select * into v_setting from public.current_platform_fee_setting();

  insert into public.invoices(employer_id, period_start, period_end, status, due_date, created_by, payroll_run_id)
  values (p_employer_id, v_run.period_start, v_run.period_end, 'draft', p_due_date, auth.uid(), p_run_id)
  returning * into v_invoice;

  for v_item in
    select pi.*, d.employee_id as dep_employee, p.full_name as employee_name, d.billing_fee_enabled, d.billing_fee_override
    from public.payroll_items pi
    join public.deployments d on d.id = pi.deployment_id
    join public.profiles p on p.id = pi.employee_id
    where pi.payroll_run_id = p_run_id and pi.employer_id = p_employer_id
  loop
    insert into public.invoice_items(invoice_id, deployment_id, description, quantity, unit_amount, total_amount, kind, payroll_item_id)
    values (v_invoice.id, v_item.deployment_id, 'Salary charge - ' || v_item.employee_name, 1, v_item.net_pay, v_item.net_pay, 'salary', v_item.id);
    v_subtotal := v_subtotal + v_item.net_pay;

    v_fee_enabled := v_item.billing_fee_enabled and coalesce(v_setting.is_enabled, true);
    if v_fee_enabled then
      v_fee := coalesce(v_item.billing_fee_override, (select billing_fee_override from public.employer_profiles where id = p_employer_id), v_setting.default_fee, 15000);
      insert into public.invoice_items(invoice_id, deployment_id, description, quantity, unit_amount, total_amount, kind, payroll_item_id)
      values (v_invoice.id, v_item.deployment_id, 'EnigteeWorld platform fee - ' || v_item.employee_name, 1, v_fee, v_fee, 'platform_fee', v_item.id);
      v_fees := v_fees + v_fee;
    end if;
  end loop;

  update public.invoices set subtotal = v_subtotal, service_fee = v_fees, total = v_subtotal + v_fees, updated_at = now()
  where id = v_invoice.id returning * into v_invoice;

  return v_invoice;
end $$;
grant execute on function public.admin_generate_invoice(uuid, uuid, date) to authenticated;

create or replace function public.admin_issue_invoice(p_invoice_id uuid)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare v_invoice public.invoices; v_employer uuid;
begin
  if not public.is_admin() then raise exception 'Only administrators can issue invoices.'; end if;
  update public.invoices set status = 'issued', issued_at = now(), updated_at = now()
  where id = p_invoice_id and status = 'draft'
  returning * into v_invoice;
  if v_invoice is null then raise exception 'Invoice not found or already issued.'; end if;

  select user_id into v_employer from public.employer_profiles where id = v_invoice.employer_id;
  perform public.notify_user(v_employer, 'invoice', 'New invoice issued',
    'Invoice ' || v_invoice.invoice_number || ' for ' || to_char(v_invoice.period_start,'DD Mon') || ' - ' || to_char(v_invoice.period_end,'DD Mon YYYY') ||
    ' totalling ' || to_char(v_invoice.total,'FM999,999,990') || ' has been issued.' ||
    case when v_invoice.due_date is not null then ' Due ' || to_char(v_invoice.due_date,'DD Mon YYYY') || '.' else '' end,
    '/employer/invoices');

  return v_invoice;
end $$;
grant execute on function public.admin_issue_invoice(uuid) to authenticated;

create or replace function public.submit_invoice_payment(p_invoice_id uuid, p_amount numeric, p_reference text, p_paid_on date, p_note text default null)
returns public.invoice_payments language plpgsql security definer set search_path = public as $$
declare v_row public.invoice_payments; v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice is null then raise exception 'Invoice not found.'; end if;
  if not (public.is_admin() or v_invoice.employer_id in (select id from public.employer_profiles where user_id = auth.uid())) then
    raise exception 'You do not have access to this invoice.';
  end if;
  if p_amount <= 0 then raise exception 'Amount must be greater than zero.'; end if;
  if coalesce(trim(p_reference),'') = '' then raise exception 'A payment reference is required.'; end if;

  insert into public.invoice_payments(invoice_id, amount, payment_reference, paid_on, note, submitted_by)
  values (p_invoice_id, p_amount, trim(p_reference), p_paid_on, nullif(trim(p_note),''), auth.uid())
  returning * into v_row;

  perform public.notify_admins('invoice', 'Payment submitted for review',
    'A payment of ' || to_char(p_amount,'FM999,999,990') || ' was submitted for invoice ' || v_invoice.invoice_number || '. Confirm it once verified.',
    '/admin/invoices');

  return v_row;
end $$;
grant execute on function public.submit_invoice_payment(uuid, numeric, text, date, text) to authenticated;

create or replace function public.admin_confirm_payment(p_payment_id uuid, p_action text)
returns public.invoice_payments language plpgsql security definer set search_path = public as $$
declare v_row public.invoice_payments; v_invoice public.invoices; v_confirmed numeric; v_employer uuid;
begin
  if not public.is_admin() then raise exception 'Only administrators can confirm payments.'; end if;
  if p_action not in ('confirm','reject') then raise exception 'Unknown action.'; end if;

  update public.invoice_payments set
    status = case p_action when 'confirm' then 'confirmed' else 'rejected' end,
    confirmed_by = auth.uid(), confirmed_at = now()
  where id = p_payment_id and status = 'pending'
  returning * into v_row;
  if v_row is null then raise exception 'Payment not found or already reviewed.'; end if;

  select * into v_invoice from public.invoices where id = v_row.invoice_id;

  if p_action = 'confirm' then
    select coalesce(sum(amount),0) into v_confirmed from public.invoice_payments
    where invoice_id = v_invoice.id and status = 'confirmed';

    update public.invoices set
      status = case when v_confirmed >= v_invoice.total then 'paid' when v_confirmed > 0 then 'partially_paid' else status end,
      updated_at = now()
    where id = v_invoice.id;
  end if;

  select user_id into v_employer from public.employer_profiles where id = v_invoice.employer_id;
  perform public.notify_user(v_employer, 'invoice',
    case when p_action = 'confirm' then 'Payment confirmed' else 'Payment could not be confirmed' end,
    case when p_action = 'confirm'
      then 'Your payment of ' || to_char(v_row.amount,'FM999,999,990') || ' for invoice ' || v_invoice.invoice_number || ' was confirmed.'
      else 'Your submitted payment of ' || to_char(v_row.amount,'FM999,999,990') || ' for invoice ' || v_invoice.invoice_number || ' could not be confirmed. Please check the reference and resubmit.'
    end,
    '/employer/invoices');

  return v_row;
end $$;
grant execute on function public.admin_confirm_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 16. Platform fee admin config RPC
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_platform_fee(p_default_fee numeric, p_is_enabled boolean, p_effective_from date default current_date)
returns public.platform_fee_settings language plpgsql security definer set search_path = public as $$
declare v_row public.platform_fee_settings;
begin
  if not public.is_admin() then raise exception 'Only administrators can change the platform fee.'; end if;
  if p_default_fee < 0 then raise exception 'Fee cannot be negative.'; end if;
  insert into public.platform_fee_settings(default_fee, is_enabled, effective_from, created_by)
  values (p_default_fee, p_is_enabled, coalesce(p_effective_from, current_date), auth.uid())
  returning * into v_row;
  return v_row;
end $$;
grant execute on function public.admin_set_platform_fee(numeric, boolean, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 17. Realtime + housekeeping
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.attendance_events;
exception when duplicate_object then null; when undefined_object then null; end $$;
