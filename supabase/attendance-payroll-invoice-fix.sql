-- ============================================================================
-- EnigteeWorld ATTENDANCE / PAYROLL / INVOICE - bugfix patch
-- Run ONCE in the Supabase SQL Editor, after attendance-payroll-invoice-patch.sql.
--
-- Fixes: "new row for relation payroll_runs violates check constraint
-- payroll_runs_status_check". The base schema's status check constraints on
-- payroll_runs, payroll_items and invoices were narrower than the values the
-- new RPCs write. This widens them to the full set actually used by the app
-- (dropping whatever check constraint currently exists on each column, by
-- name pattern rather than assuming Postgres's default name, so it works
-- however the original constraint ended up named).
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.payroll_runs'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.payroll_runs drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.payroll_runs add constraint payroll_runs_status_check
  check (status in ('draft','calculating','calculated','pending_review','approved','locked','processing','paid','rejected','voided','reopened','partially_paid','cancelled','failed'));

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.payroll_items'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%payment_status%'
  loop
    execute format('alter table public.payroll_items drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.payroll_items add constraint payroll_items_payment_status_check
  check (payment_status in ('pending','processing','paid','failed','cancelled','on_hold'));

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.invoices'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.invoices drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.invoices add constraint invoices_status_check
  check (status in ('draft','issued','sent','partially_paid','paid','overdue','disputed','voided','cancelled'));

-- ---------------------------------------------------------------------------
-- Fix: employers could see (and get counted totals for) DRAFT invoices.
-- Drafts are an internal admin staging step before an invoice is issued -
-- an employer should see nothing about an invoice until it's issued. The
-- base schema's "invoice employer access" policy didn't exclude drafts,
-- which is why a draft invoice's total showed up as "Outstanding" on the
-- employer dashboard even though the Invoices page (which filters drafts
-- client-side) correctly showed nothing.
-- ---------------------------------------------------------------------------
drop policy if exists "invoice employer access" on public.invoices;
create policy "invoice employer access" on public.invoices for select using (
  public.is_admin()
  or (status <> 'draft' and employer_id in (select id from public.employer_profiles where user_id = auth.uid()))
);

drop policy if exists "invoice item access" on public.invoice_items;
create policy "invoice item access" on public.invoice_items for select using (
  invoice_id in (
    select id from public.invoices
    where public.is_admin()
      or (status <> 'draft' and employer_id in (select id from public.employer_profiles where user_id = auth.uid()))
  )
);

-- ---------------------------------------------------------------------------
-- Fix: there was no way to record that EnigteeWorld actually paid employees
-- out (as distinct from the employer paying EnigteeWorld's invoice - two
-- separate real-world money movements). payroll_items.payment_status could
-- already technically be set to 'paid', but nothing in the app ever did it,
-- so employees stayed stuck on "pending" forever. This adds an explicit,
-- deliberate admin action for it - "Mark payroll as paid" on a payroll run,
-- done after admin has actually transferred money to each employee's payout
-- account (typically at month end, after the employer's invoice is settled).
-- ---------------------------------------------------------------------------
alter table public.payroll_items add column if not exists paid_at timestamptz;
alter table public.payroll_items add column if not exists paid_by uuid references public.profiles(id);

create or replace function public.admin_mark_payroll_paid(p_run_id uuid)
returns public.payroll_runs language plpgsql security definer set search_path = public as $$
declare v_run public.payroll_runs; v_item record;
begin
  if not public.is_admin() then raise exception 'Only administrators can mark payroll as paid.'; end if;

  select * into v_run from public.payroll_runs where id = p_run_id;
  if v_run is null then raise exception 'Payroll run not found.'; end if;
  if v_run.status not in ('approved','paid') then
    raise exception 'Payroll must be approved before it can be marked as paid.';
  end if;

  update public.payroll_items
  set payment_status = 'paid', paid_at = now(), paid_by = auth.uid()
  where payroll_run_id = p_run_id and payment_status <> 'paid';

  update public.payroll_runs set status = 'paid', updated_at = now() where id = p_run_id returning * into v_run;

  for v_item in select * from public.payroll_items where payroll_run_id = p_run_id loop
    perform public.notify_user(v_item.employee_id, 'payroll', 'You have been paid',
      'Your pay of ' || to_char(v_item.net_pay,'FM999,999,990') || ' for ' || to_char(v_run.period_start,'DD Mon') || ' - ' || to_char(v_run.period_end,'DD Mon YYYY') ||
      ' has been sent to your payout account.', '/employee/payroll');
  end loop;

  return v_run;
end $$;
grant execute on function public.admin_mark_payroll_paid(uuid) to authenticated;

-- Allow the lock-payroll-items trigger (added in the main patch) to permit
-- this specific transition: it only blocks edits once status is already
-- approved/paid for NON-admins, and this function runs as an admin action
-- (auth.uid() is still the calling admin under SECURITY DEFINER), so no
-- change needed there - included here only as a note for future readers.

-- ============================================================================
-- Round 3 fixes: check-in/out reliability, auto late-detection, company payout
-- account, payment receipts, employer/admin-editable work schedules, and the
-- "platform fee only on a fully completed month" rule.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Attendance scan: find ANY open session for the deployment (not just one
--    matching today's server-side date) before creating a new check-in. This
--    is what was causing a second scan to create a duplicate check-in instead
--    of closing the first one out - a date-boundary mismatch between the
--    database's default timezone and Africa/Lagos could make "today" differ
--    from what the employee expects, and this removes that class of bug
--    entirely rather than trying to patch the date comparison. New check-ins
--    now also explicitly use Africa/Lagos for attendance_date.
-- ---------------------------------------------------------------------------
create or replace function public.employee_attendance_scan(p_token text)
returns public.attendance_events language plpgsql security definer set search_path = public as $$
declare
  v_point public.attendance_points;
  v_deployment public.deployments;
  v_open public.attendance_events;
  v_row public.attendance_events;
  v_today date;
begin
  select * into v_point from public.attendance_points where qr_token = upper(trim(p_token));
  if v_point is null then raise exception 'This attendance code was not recognised. Ask your supervisor for the current code.'; end if;
  if not v_point.is_active then raise exception 'This attendance point is not active. Ask your supervisor for the current code.'; end if;
  if v_point.expires_at is not null and v_point.expires_at < now() then raise exception 'This attendance code has expired. Ask your supervisor for the current code.'; end if;

  select * into v_deployment from public.deployments
  where employee_id = auth.uid() and establishment_id = v_point.establishment_id
    and status in ('active','pending_start','onboarding')
  order by (status = 'active') desc, created_at desc
  limit 1;
  if v_deployment is null then
    raise exception 'You do not have an active deployment at this establishment.';
  end if;

  select * into v_open from public.attendance_events
  where deployment_id = v_deployment.id and check_out_at is null
  order by check_in_at desc
  limit 1;

  if v_open is not null then
    update public.attendance_events
    set check_out_at = now()
    where id = v_open.id
    returning * into v_row;
    return v_row;
  end if;

  v_today := (now() at time zone 'Africa/Lagos')::date;

  insert into public.attendance_events(
    deployment_id, employee_id, establishment_id, attendance_date, check_in_at,
    status, source, attendance_point_id, confirmation_status, created_by
  ) values (
    v_deployment.id, auth.uid(), v_point.establishment_id, v_today, now(),
    'pending_review', 'qr', v_point.id, 'pending_confirmation', auth.uid()
  ) returning * into v_row;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Auto-classify present vs late from the deployment's active schedule when
--    confirming attendance, unless the reviewer explicitly overrides it.
-- ---------------------------------------------------------------------------
create or replace function public.attendance_expected_status(p_deployment_id uuid, p_work_date date, p_check_in_at timestamptz)
returns text language plpgsql stable as $$
declare v_schedule public.employment_schedules; v_local_time time; v_cutoff time;
begin
  if p_check_in_at is null then return 'present'; end if;

  select * into v_schedule from public.employment_schedules
  where deployment_id = p_deployment_id
    and effective_from <= p_work_date
    and (effective_to is null or effective_to >= p_work_date)
  order by effective_from desc
  limit 1;

  -- No schedule configured, or an overnight shift (too ambiguous to judge
  -- lateness from a bare time-of-day comparison) - default to present and
  -- let the reviewer override manually if needed.
  if v_schedule is null or v_schedule.shift_start is null or v_schedule.overnight then
    return 'present';
  end if;

  v_local_time := (p_check_in_at at time zone v_schedule.timezone)::time;
  v_cutoff := v_schedule.shift_start + make_interval(mins => coalesce(v_schedule.grace_minutes, 0));

  if v_local_time > v_cutoff then
    return 'late';
  end if;
  return 'present';
end $$;

create or replace function public.review_attendance(p_event_id uuid, p_action text, p_status text default null, p_notes text default null)
returns public.attendance_events language plpgsql security definer set search_path = public as $$
declare v_event public.attendance_events; v_row public.attendance_events; v_final_status text;
begin
  if p_action not in ('confirm','reject') then raise exception 'Unknown review action.'; end if;

  select * into v_event from public.attendance_events where id = p_event_id;
  if v_event is null then raise exception 'Attendance record not found.'; end if;
  if not (public.is_admin() or public.owns_establishment(v_event.establishment_id)) then
    raise exception 'You do not have access to this attendance record.';
  end if;

  if p_action = 'confirm' then
    v_final_status := coalesce(nullif(trim(p_status), ''), public.attendance_expected_status(v_event.deployment_id, v_event.attendance_date, v_event.check_in_at));
  else
    v_final_status := 'unapproved_absence';
  end if;

  update public.attendance_events set
    confirmation_status = case p_action when 'confirm' then 'confirmed' else 'rejected' end,
    status = v_final_status::public.attendance_status,
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

-- ---------------------------------------------------------------------------
-- 3. Company payout account - admin sets it, employers can see it so they
--    know where to send money for an invoice.
-- ---------------------------------------------------------------------------
create table if not exists public.company_payout_settings (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  instructions text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.company_payout_settings enable row level security;

drop policy if exists "read company payout settings" on public.company_payout_settings;
create policy "read company payout settings" on public.company_payout_settings for select using (
  public.is_admin() or exists (select 1 from public.employer_profiles where user_id = auth.uid())
);

drop policy if exists "admin manage payout settings" on public.company_payout_settings;
create policy "admin manage payout settings" on public.company_payout_settings for all
using (public.is_admin()) with check (public.is_admin());

create or replace function public.admin_set_payout_account(p_bank_name text, p_account_number text, p_account_name text, p_instructions text default null)
returns public.company_payout_settings language plpgsql security definer set search_path = public as $$
declare v_row public.company_payout_settings;
begin
  if not public.is_admin() then raise exception 'Only administrators can set the payout account.'; end if;
  if coalesce(trim(p_bank_name),'') = '' or coalesce(trim(p_account_number),'') = '' or coalesce(trim(p_account_name),'') = '' then
    raise exception 'Bank name, account number and account name are all required.';
  end if;
  insert into public.company_payout_settings(bank_name, account_number, account_name, instructions, updated_by)
  values (trim(p_bank_name), trim(p_account_number), trim(p_account_name), nullif(trim(p_instructions),''), auth.uid())
  returning * into v_row;
  return v_row;
end $$;
grant execute on function public.admin_set_payout_account(text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Payment receipts - employer attaches proof when submitting a payment.
-- ---------------------------------------------------------------------------
alter table public.invoice_payments add column if not exists receipt_path text;

create or replace function public.submit_invoice_payment(p_invoice_id uuid, p_amount numeric, p_reference text, p_paid_on date, p_note text default null, p_receipt_path text default null)
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

  insert into public.invoice_payments(invoice_id, amount, payment_reference, paid_on, note, submitted_by, receipt_path)
  values (p_invoice_id, p_amount, trim(p_reference), p_paid_on, nullif(trim(p_note),''), auth.uid(), p_receipt_path)
  returning * into v_row;

  perform public.notify_admins('invoice', 'Payment submitted for review',
    'A payment of ' || to_char(p_amount,'FM999,999,990') || ' was submitted for invoice ' || v_invoice.invoice_number || '.' ||
    case when p_receipt_path is not null then ' A receipt was attached.' else '' end || ' Confirm it once verified.',
    '/admin/invoices');

  return v_row;
end $$;
grant execute on function public.submit_invoice_payment(uuid, numeric, text, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Work schedules - employer OR admin can set/update a deployment's
--    approved schedule; every save is versioned (closes the prior row rather
--    than overwriting it), so historical payroll is never rewritten.
-- ---------------------------------------------------------------------------
create or replace function public.set_employment_schedule(
  p_deployment_id uuid,
  p_schedule_type text,
  p_working_days smallint[],
  p_expected_hours numeric,
  p_shift_start time,
  p_shift_end time,
  p_overnight boolean,
  p_grace_minutes integer,
  p_notes text default null
) returns public.employment_schedules language plpgsql security definer set search_path = public as $$
declare v_row public.employment_schedules; v_today date := current_date; v_days text; v_employee uuid; v_body text;
begin
  if not (public.is_admin() or public.owns_deployment_employer(p_deployment_id)) then
    raise exception 'You do not have access to this deployment.';
  end if;
  if p_working_days is null or array_length(p_working_days, 1) is null then
    raise exception 'Select at least one working day.';
  end if;

  update public.employment_schedules
  set effective_to = v_today - 1
  where deployment_id = p_deployment_id and effective_to is null and effective_from < v_today;

  delete from public.employment_schedules
  where deployment_id = p_deployment_id and effective_from = v_today and effective_to is null;

  insert into public.employment_schedules(
    deployment_id, schedule_type, working_days, expected_hours, shift_start, shift_end,
    overnight, grace_minutes, effective_from, notes, created_by
  ) values (
    p_deployment_id, p_schedule_type, p_working_days, p_expected_hours, p_shift_start, p_shift_end,
    coalesce(p_overnight, false), coalesce(p_grace_minutes, 15), v_today, nullif(trim(coalesce(p_notes,'')),''), auth.uid()
  ) returning * into v_row;

  select string_agg(label, ', ' order by ord) into v_days
  from unnest(v_row.working_days) with ordinality as t(day, ord)
  join (values (0,'Sun'),(1,'Mon'),(2,'Tue'),(3,'Wed'),(4,'Thu'),(5,'Fri'),(6,'Sat')) as names(day, label) using (day);

  v_body := 'Your approved work schedule is now: ' || coalesce(v_days, 'as set') ||
    case when v_row.shift_start is not null
      then ' from ' || to_char(v_row.shift_start,'HH12:MI AM') || case when v_row.shift_end is not null then ' to ' || to_char(v_row.shift_end,'HH12:MI AM') else '' end
      else '' end ||
    case when v_row.overnight then ' (overnight shift)' else '' end || '.';

  select employee_id into v_employee from public.deployments where id = p_deployment_id;
  perform public.notify_user(v_employee, 'schedule', 'Your work schedule was updated', v_body, '/employee/attendance');

  return v_row;
end $$;
grant execute on function public.set_employment_schedule(uuid, text, smallint[], numeric, time, time, boolean, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Platform fee only for a deployment that covered the FULL payroll period
--    (didn't start late or leave early) - "only on candidates who
--    successfully complete a month."
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
    select pi.*, d.employee_id as dep_employee, p.full_name as employee_name, d.billing_fee_enabled, d.billing_fee_override,
           d.start_date as dep_start, d.end_date as dep_end
    from public.payroll_items pi
    join public.deployments d on d.id = pi.deployment_id
    join public.profiles p on p.id = pi.employee_id
    where pi.payroll_run_id = p_run_id and pi.employer_id = p_employer_id
  loop
    insert into public.invoice_items(invoice_id, deployment_id, description, quantity, unit_amount, total_amount, kind, payroll_item_id)
    values (v_invoice.id, v_item.deployment_id, 'Salary charge - ' || v_item.employee_name, 1, v_item.net_pay, v_item.net_pay, 'salary', v_item.id);
    v_subtotal := v_subtotal + v_item.net_pay;

    -- Fee only applies when the deployment covered the entire period - no
    -- mid-month start, no mid-month departure.
    v_fee_enabled := v_item.billing_fee_enabled and coalesce(v_setting.is_enabled, true)
      and v_item.dep_start is not null and v_item.dep_start <= v_run.period_start
      and (v_item.dep_end is null or v_item.dep_end >= v_run.period_end);

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
