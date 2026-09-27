-- ============================================================================
-- ENIGTEEWORLD PRODUCTION STAGE FINAL PATCH
-- Run AFTER the existing EnigteeWorld schema + workflow + attendance/payroll/
-- invoice patches + production-hardening-patch.sql.
-- Idempotent.
--
-- Covers the production-stage fixes requested:
--   * reliable employee QR checkout using a dedicated checkout RPC
--   * QR regeneration without gen_random_bytes() dependency in the RPC
--   * automatic late classification from the approved employment schedule
--   * platform fee charged only when a deployment covers the FULL payroll period
--     (no fee when an employee leaves before the period/month ends)
--   * invoice overdue status refresh
--   * post-issue credit notes
--   * employer invoice disputes + admin resolution
--   * company branding table + public branding storage + admin RPC
--   * payroll/invoice status constraints remain compatible with the app
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Payroll status compatibility
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.payroll_runs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.payroll_runs drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.payroll_runs
  add constraint payroll_runs_status_check
  check (status in (
    'draft','calculating','calculated','pending_review','reviewed',
    'approved','locked','processing','paid','rejected','voided',
    'reopened','partially_paid','cancelled','failed'
  ));

do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.invoices drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft','issued','sent','partially_paid','paid','overdue','disputed','credited','voided','cancelled'));

-- ---------------------------------------------------------------------------
-- 2. QR regeneration: do not depend on gen_random_bytes(integer) being on the
--    function search_path. UUID randomness is already available in this app.
-- ---------------------------------------------------------------------------
create or replace function public.regenerate_attendance_point(p_point_id uuid)
returns public.attendance_points
language plpgsql
security definer
set search_path = public
as $$
declare
  v_establishment uuid;
  v_row public.attendance_points;
begin
  select establishment_id
    into v_establishment
  from public.attendance_points
  where id = p_point_id;

  if v_establishment is null then
    raise exception 'Attendance point not found.';
  end if;

  if not (public.is_admin() or public.owns_establishment(v_establishment)) then
    raise exception 'You do not have access to this attendance point.';
  end if;

  update public.attendance_points
  set qr_token = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      updated_at = now()
  where id = p_point_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.regenerate_attendance_point(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reliable employee check-in / checkout.
--    The employee UI now calls checkout explicitly when an open session exists.
-- ---------------------------------------------------------------------------
create or replace function public.employee_attendance_scan(p_token text)
returns public.attendance_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_point public.attendance_points;
  v_deployment public.deployments;
  v_row public.attendance_events;
  v_today date;
begin
  select * into v_point
  from public.attendance_points
  where qr_token = upper(trim(p_token));

  if v_point is null then
    raise exception 'This attendance code was not recognised. Ask your supervisor for the current code.';
  end if;
  if not v_point.is_active then
    raise exception 'This attendance point is not active. Ask your supervisor for the current code.';
  end if;
  if v_point.expires_at is not null and v_point.expires_at < now() then
    raise exception 'This attendance code has expired. Ask your supervisor for the current code.';
  end if;

  select * into v_deployment
  from public.deployments
  where employee_id = auth.uid()
    and establishment_id = v_point.establishment_id
    and status in ('active','pending_start','onboarding')
  order by (status = 'active') desc, created_at desc
  limit 1;

  if v_deployment is null then
    raise exception 'You do not have an active deployment at this establishment.';
  end if;

  v_today := (now() at time zone 'Africa/Lagos')::date;

  insert into public.attendance_events(
    deployment_id,
    employee_id,
    establishment_id,
    attendance_date,
    check_in_at,
    status,
    source,
    attendance_point_id,
    confirmation_status,
    created_by
  )
  values (
    v_deployment.id,
    auth.uid(),
    v_point.establishment_id,
    v_today,
    now(),
    'pending_review',
    'qr',
    v_point.id,
    'pending_confirmation',
    auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.employee_attendance_scan(text) to authenticated;

create or replace function public.employee_attendance_checkout(p_token text)
returns public.attendance_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_point public.attendance_points;
  v_deployment public.deployments;
  v_row public.attendance_events;
begin
  select * into v_point
  from public.attendance_points
  where qr_token = upper(trim(p_token));

  if v_point is null then
    raise exception 'This attendance code was not recognised. Ask your supervisor for the current code.';
  end if;
  if not v_point.is_active then
    raise exception 'This attendance point is not active. Ask your supervisor for the current code.';
  end if;

  select * into v_deployment
  from public.deployments
  where employee_id = auth.uid()
    and establishment_id = v_point.establishment_id
    and status in ('active','pending_start','onboarding')
  order by (status = 'active') desc, created_at desc
  limit 1;

  if v_deployment is null then
    raise exception 'You do not have an active deployment at this establishment.';
  end if;

  select * into v_row
  from public.attendance_events
  where deployment_id = v_deployment.id
    and employee_id = auth.uid()
    and check_in_at is not null
    and check_out_at is null
  order by check_in_at desc
  limit 1;

  if v_row is null then
    raise exception 'No open attendance session was found. Check in first.';
  end if;

  update public.attendance_events
  set check_out_at = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.employee_attendance_checkout(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Automatic late detection.
--    A reviewer can still explicitly override the classification by passing
--    p_status. Otherwise the approved schedule decides present vs late.
-- ---------------------------------------------------------------------------
create or replace function public.attendance_expected_status(
  p_deployment_id uuid,
  p_work_date date,
  p_check_in_at timestamptz
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_schedule public.employment_schedules;
  v_local_time time;
  v_cutoff time;
  v_day smallint;
begin
  if p_check_in_at is null then
    return 'present';
  end if;

  select * into v_schedule
  from public.employment_schedules
  where deployment_id = p_deployment_id
    and effective_from <= p_work_date
    and (effective_to is null or effective_to >= p_work_date)
  order by effective_from desc
  limit 1;

  if v_schedule is null or v_schedule.shift_start is null then
    return 'present';
  end if;

  v_day := extract(dow from p_work_date)::smallint;
  if not (v_day = any(v_schedule.working_days)) then
    return 'present';
  end if;

  if v_schedule.overnight then
    return 'present';
  end if;

  v_local_time := (p_check_in_at at time zone coalesce(v_schedule.timezone, 'Africa/Lagos'))::time;
  v_cutoff := v_schedule.shift_start + make_interval(mins => coalesce(v_schedule.grace_minutes, 0));

  if v_local_time > v_cutoff then
    return 'late';
  end if;

  return 'present';
end;
$$;

grant execute on function public.attendance_expected_status(uuid, date, timestamptz) to authenticated;

create or replace function public.review_attendance(
  p_event_id uuid,
  p_action text,
  p_status text default null,
  p_notes text default null
)
returns public.attendance_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.attendance_events;
  v_row public.attendance_events;
  v_final_status text;
begin
  if p_action not in ('confirm','reject') then
    raise exception 'Unknown review action.';
  end if;

  select * into v_event
  from public.attendance_events
  where id = p_event_id;

  if v_event is null then
    raise exception 'Attendance record not found.';
  end if;

  if not (public.is_admin() or public.owns_establishment(v_event.establishment_id)) then
    raise exception 'You do not have access to this attendance record.';
  end if;

  if p_action = 'confirm' then
    v_final_status := coalesce(
      nullif(trim(p_status), ''),
      public.attendance_expected_status(v_event.deployment_id, v_event.attendance_date, v_event.check_in_at)
    );
  else
    v_final_status := 'unapproved_absence';
  end if;

  update public.attendance_events
  set confirmation_status = case p_action when 'confirm' then 'confirmed' else 'rejected' end,
      status = v_final_status::public.attendance_status,
      confirmed_by = auth.uid(),
      confirmed_at = now(),
      notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = p_event_id
  returning * into v_row;

  perform public.notify_user(
    v_row.employee_id,
    'attendance',
    case when p_action = 'confirm' then 'Attendance confirmed' else 'Attendance rejected' end,
    case when p_action = 'confirm'
      then 'Your attendance on ' || to_char(v_row.attendance_date,'DD Mon YYYY') ||
           ' was confirmed as ' || replace(v_row.status::text,'_',' ') || '.'
      else 'Your attendance on ' || to_char(v_row.attendance_date,'DD Mon YYYY') ||
           ' was not confirmed.' ||
           case when p_notes is not null then E'\n\nNote: ' || p_notes else '' end
    end,
    '/employee/attendance'
  );

  return v_row;
end;
$$;

grant execute on function public.review_attendance(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Platform fee rule: salary may still be calculated for the period, but the
--    EnigteeWorld platform fee is NOT charged unless the deployment covered the
--    FULL payroll period. This is the agreed "completed month" rule.
-- ---------------------------------------------------------------------------
create or replace function public.admin_generate_invoice(
  p_run_id uuid,
  p_employer_id uuid,
  p_due_date date default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
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
  if not public.is_admin() then
    raise exception 'Only administrators can generate invoices.';
  end if;

  select * into v_run from public.payroll_runs where id = p_run_id;
  if v_run is null or v_run.status not in ('approved','paid') then
    raise exception 'Payroll must be approved before an invoice can be generated.';
  end if;

  if exists (
    select 1 from public.invoices
    where payroll_run_id = p_run_id and employer_id = p_employer_id
  ) then
    raise exception 'An invoice already exists for this employer and payroll run.';
  end if;

  select * into v_setting from public.current_platform_fee_setting();

  insert into public.invoices(
    employer_id, period_start, period_end, status, due_date, created_by, payroll_run_id
  )
  values (
    p_employer_id, v_run.period_start, v_run.period_end, 'draft', p_due_date, auth.uid(), p_run_id
  )
  returning * into v_invoice;

  for v_item in
    select pi.*,
           p.full_name as employee_name,
           d.billing_fee_enabled,
           d.billing_fee_override,
           d.start_date as dep_start,
           d.end_date as dep_end
    from public.payroll_items pi
    join public.deployments d on d.id = pi.deployment_id
    join public.profiles p on p.id = pi.employee_id
    where pi.payroll_run_id = p_run_id
      and pi.employer_id = p_employer_id
  loop
    insert into public.invoice_items(
      invoice_id, deployment_id, description, quantity, unit_amount, total_amount, kind, payroll_item_id
    )
    values (
      v_invoice.id,
      v_item.deployment_id,
      'Salary charge - ' || v_item.employee_name,
      1,
      v_item.net_pay,
      v_item.net_pay,
      'salary',
      v_item.id
    );

    v_subtotal := v_subtotal + v_item.net_pay;

    v_fee_enabled := coalesce(v_item.billing_fee_enabled, true)
      and coalesce(v_setting.is_enabled, true)
      and v_item.dep_start is not null
      and v_item.dep_start <= v_run.period_start
      and (v_item.dep_end is null or v_item.dep_end >= v_run.period_end);

    if v_fee_enabled then
      v_fee := coalesce(
        v_item.billing_fee_override,
        (select billing_fee_override from public.employer_profiles where id = p_employer_id),
        v_setting.default_fee,
        15000
      );

      insert into public.invoice_items(
        invoice_id, deployment_id, description, quantity, unit_amount, total_amount, kind, payroll_item_id
      )
      values (
        v_invoice.id,
        v_item.deployment_id,
        'EnigteeWorld platform fee - ' || v_item.employee_name,
        1,
        v_fee,
        v_fee,
        'platform_fee',
        v_item.id
      );

      v_fees := v_fees + v_fee;
    end if;
  end loop;

  update public.invoices
  set subtotal = v_subtotal,
      service_fee = v_fees,
      total = v_subtotal + v_fees,
      updated_at = now()
  where id = v_invoice.id
  returning * into v_invoice;

  return v_invoice;
end;
$$;

grant execute on function public.admin_generate_invoice(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Invoice overdue detection.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists credited_amount numeric(12,2) not null default 0;

create or replace function public.refresh_invoice_overdue_statuses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.invoices i
  set status = 'overdue', updated_at = now()
  where i.due_date is not null
    and i.due_date < current_date
    and i.status in ('issued','sent','partially_paid')
    and coalesce((select sum(ip.amount) from public.invoice_payments ip where ip.invoice_id = i.id and ip.status = 'confirmed'), 0)
        + coalesce(i.credited_amount, 0) < coalesce(i.total, 0);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.refresh_invoice_overdue_statuses() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Credit notes for corrections after an invoice has been issued.
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_credit_notes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  credit_note_number text unique not null default ('CN-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  status text not null default 'issued' check (status in ('issued','voided')),
  created_by uuid not null references public.profiles(id),
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoice_credit_notes_invoice on public.invoice_credit_notes(invoice_id, created_at desc);
alter table public.invoice_credit_notes enable row level security;

drop policy if exists "admin manage credit notes" on public.invoice_credit_notes;
create policy "admin manage credit notes" on public.invoice_credit_notes
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "employer reads credit notes" on public.invoice_credit_notes;
create policy "employer reads credit notes" on public.invoice_credit_notes
for select using (
  invoice_id in (
    select id from public.invoices
    where employer_id in (select id from public.employer_profiles where user_id = auth.uid())
  )
);

create or replace function public.admin_issue_credit_note(
  p_invoice_id uuid,
  p_amount numeric,
  p_reason text
)
returns public.invoice_credit_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_existing numeric;
  v_note public.invoice_credit_notes;
  v_balance numeric;
  v_confirmed numeric;
  v_employer uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can issue credit notes.';
  end if;
  if p_amount <= 0 then
    raise exception 'Credit note amount must be greater than zero.';
  end if;
  if coalesce(trim(p_reason),'') = '' then
    raise exception 'A reason is required for a credit note.';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice is null then raise exception 'Invoice not found.'; end if;
  if v_invoice.status in ('draft','cancelled','voided') then
    raise exception 'A credit note can only be issued against an issued invoice.';
  end if;

  select coalesce(sum(amount),0) into v_existing
  from public.invoice_credit_notes
  where invoice_id = p_invoice_id and status = 'issued';

  if p_amount > greatest(v_invoice.total - v_existing, 0) then
    raise exception 'Credit note exceeds the remaining invoice value.';
  end if;

  insert into public.invoice_credit_notes(invoice_id, amount, reason, created_by)
  values (p_invoice_id, p_amount, trim(p_reason), auth.uid())
  returning * into v_note;

  update public.invoices
  set credited_amount = coalesce(v_invoice.credited_amount, 0) + p_amount,
      updated_at = now()
  where id = p_invoice_id
  returning * into v_invoice;

  select coalesce(sum(amount),0) into v_confirmed
  from public.invoice_payments
  where invoice_id = p_invoice_id and status = 'confirmed';

  v_balance := greatest(v_invoice.total - coalesce(v_invoice.credited_amount,0), 0);

  update public.invoices
  set status = case
    when v_balance <= 0 then 'credited'
    when v_confirmed >= v_balance then 'paid'
    when v_confirmed > 0 then 'partially_paid'
    when due_date is not null and due_date < current_date then 'overdue'
    else status
  end,
  updated_at = now()
  where id = p_invoice_id;

  select user_id into v_employer from public.employer_profiles where id = v_invoice.employer_id;
  perform public.notify_user(
    v_employer,
    'invoice',
    'Credit note issued',
    'Credit note ' || v_note.credit_note_number || ' for ' || to_char(v_note.amount,'FM999,999,990') ||
    ' has been applied to invoice ' || v_invoice.invoice_number || '. Reason: ' || v_note.reason,
    '/employer/invoices'
  );

  return v_note;
end;
$$;

grant execute on function public.admin_issue_credit_note(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Employer invoice disputes.
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_disputes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  employer_id uuid not null references public.employer_profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','under_review','resolved','rejected','withdrawn')),
  resolution_note text,
  created_by uuid not null references public.profiles(id),
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoice_disputes_invoice on public.invoice_disputes(invoice_id, created_at desc);
alter table public.invoice_disputes enable row level security;

drop policy if exists "admin manage invoice disputes" on public.invoice_disputes;
create policy "admin manage invoice disputes" on public.invoice_disputes
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "employer manages own disputes" on public.invoice_disputes;
create policy "employer manages own disputes" on public.invoice_disputes
for select using (employer_id in (select id from public.employer_profiles where user_id = auth.uid()));

create or replace function public.employer_dispute_invoice(
  p_invoice_id uuid,
  p_reason text,
  p_details text default null
)
returns public.invoice_disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_employer_id uuid;
  v_dispute public.invoice_disputes;
begin
  select id into v_employer_id
  from public.employer_profiles
  where user_id = auth.uid();

  if v_employer_id is null then raise exception 'Employer profile not found.'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A dispute reason is required.'; end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice is null then raise exception 'Invoice not found.'; end if;
  if v_invoice.employer_id <> v_employer_id then raise exception 'You do not have access to this invoice.'; end if;
  if v_invoice.status in ('draft','paid','cancelled','voided') then raise exception 'This invoice cannot be disputed in its current state.'; end if;

  if exists (
    select 1 from public.invoice_disputes
    where invoice_id = p_invoice_id and status in ('open','under_review')
  ) then
    raise exception 'This invoice already has an open dispute.';
  end if;

  insert into public.invoice_disputes(invoice_id, employer_id, reason, details, created_by)
  values (p_invoice_id, v_employer_id, trim(p_reason), nullif(trim(p_details),''), auth.uid())
  returning * into v_dispute;

  update public.invoices set status = 'disputed', updated_at = now() where id = p_invoice_id;

  perform public.notify_admins(
    'invoice',
    'Invoice disputed',
    'Invoice ' || v_invoice.invoice_number || ' has been disputed by the employer. Reason: ' || trim(p_reason),
    '/admin/invoices'
  );

  return v_dispute;
end;
$$;

grant execute on function public.employer_dispute_invoice(uuid, text, text) to authenticated;

create or replace function public.admin_resolve_invoice_dispute(
  p_dispute_id uuid,
  p_action text,
  p_resolution_note text default null
)
returns public.invoice_disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute public.invoice_disputes;
  v_invoice public.invoices;
  v_confirmed numeric;
  v_balance numeric;
  v_employer uuid;
begin
  if not public.is_admin() then raise exception 'Only administrators can resolve invoice disputes.'; end if;
  if p_action not in ('resolve','reject') then raise exception 'Unknown dispute action.'; end if;

  select * into v_dispute from public.invoice_disputes where id = p_dispute_id;
  if v_dispute is null then raise exception 'Dispute not found.'; end if;
  if v_dispute.status not in ('open','under_review') then raise exception 'This dispute has already been resolved.'; end if;

  update public.invoice_disputes
  set status = case when p_action = 'resolve' then 'resolved' else 'rejected' end,
      resolution_note = nullif(trim(p_resolution_note),''),
      resolved_by = auth.uid(),
      updated_at = now()
  where id = p_dispute_id
  returning * into v_dispute;

  select * into v_invoice from public.invoices where id = v_dispute.invoice_id;
  select coalesce(sum(amount),0) into v_confirmed
  from public.invoice_payments
  where invoice_id = v_invoice.id and status = 'confirmed';
  v_balance := greatest(v_invoice.total - coalesce(v_invoice.credited_amount,0), 0);

  update public.invoices
  set status = case
    when v_balance <= 0 then 'credited'
    when v_confirmed >= v_balance then 'paid'
    when v_confirmed > 0 then 'partially_paid'
    when due_date is not null and due_date < current_date then 'overdue'
    else 'issued'
  end,
  updated_at = now()
  where id = v_invoice.id;

  select user_id into v_employer from public.employer_profiles where id = v_invoice.employer_id;
  perform public.notify_user(
    v_employer,
    'invoice',
    case when p_action = 'resolve' then 'Invoice dispute resolved' else 'Invoice dispute rejected' end,
    'Your dispute for invoice ' || v_invoice.invoice_number || ' has been ' || p_action || '.' ||
    case when p_resolution_note is not null then E'\n\nNote: ' || p_resolution_note else '' end,
    '/employer/invoices'
  );

  return v_dispute;
end;
$$;

grant execute on function public.admin_resolve_invoice_dispute(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Keep payment confirmation aligned with credit notes.
-- ---------------------------------------------------------------------------
create or replace function public.admin_confirm_payment(p_payment_id uuid, p_action text)
returns public.invoice_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invoice_payments;
  v_invoice public.invoices;
  v_confirmed numeric;
  v_balance numeric;
  v_employer uuid;
begin
  if not public.is_admin() then raise exception 'Only administrators can confirm payments.'; end if;
  if p_action not in ('confirm','reject') then raise exception 'Unknown action.'; end if;

  update public.invoice_payments
  set status = case p_action when 'confirm' then 'confirmed' else 'rejected' end,
      confirmed_by = auth.uid(),
      confirmed_at = now()
  where id = p_payment_id and status = 'pending'
  returning * into v_row;

  if v_row is null then raise exception 'Payment not found or already reviewed.'; end if;

  select * into v_invoice from public.invoices where id = v_row.invoice_id;

  if p_action = 'confirm' then
    select coalesce(sum(amount),0) into v_confirmed
    from public.invoice_payments
    where invoice_id = v_invoice.id and status = 'confirmed';

    v_balance := greatest(v_invoice.total - coalesce(v_invoice.credited_amount,0), 0);

    update public.invoices
    set status = case
      when v_balance <= 0 then 'credited'
      when v_confirmed >= v_balance then 'paid'
      when v_confirmed > 0 then 'partially_paid'
      when due_date is not null and due_date < current_date then 'overdue'
      else status
    end,
    updated_at = now()
    where id = v_invoice.id;
  end if;

  select user_id into v_employer from public.employer_profiles where id = v_invoice.employer_id;
  perform public.notify_user(
    v_employer,
    'invoice',
    case when p_action = 'confirm' then 'Payment confirmed' else 'Payment could not be confirmed' end,
    case when p_action = 'confirm'
      then 'Your payment of ' || to_char(v_row.amount,'FM999,999,990') || ' for invoice ' || v_invoice.invoice_number || ' was confirmed.'
      else 'Your submitted payment of ' || to_char(v_row.amount,'FM999,999,990') || ' for invoice ' || v_invoice.invoice_number || ' could not be confirmed. Please check the reference and resubmit.'
    end,
    '/employer/invoices'
  );

  return v_row;
end;
$$;

grant execute on function public.admin_confirm_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Branding table + storage.
-- ---------------------------------------------------------------------------
create table if not exists public.branding (
  id text primary key default 'default',
  logo_url text,
  favicon_url text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.branding(id)
values ('default')
on conflict (id) do nothing;

alter table public.branding enable row level security;

drop policy if exists "public can read branding" on public.branding;
create policy "public can read branding" on public.branding
for select using (true);

drop policy if exists "admin manages branding" on public.branding;
create policy "admin manages branding" on public.branding
for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  true,
  3145728,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do update set public = true, file_size_limit = 3145728,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml'];

drop policy if exists "public read branding files" on storage.objects;
create policy "public read branding files" on storage.objects
for select using (bucket_id = 'branding');

drop policy if exists "admins upload branding files" on storage.objects;
create policy "admins upload branding files" on storage.objects
for insert to authenticated with check (bucket_id = 'branding' and public.is_admin());

drop policy if exists "admins update branding files" on storage.objects;
create policy "admins update branding files" on storage.objects
for update to authenticated using (bucket_id = 'branding' and public.is_admin()) with check (bucket_id = 'branding' and public.is_admin());

drop policy if exists "admins delete branding files" on storage.objects;
create policy "admins delete branding files" on storage.objects
for delete to authenticated using (bucket_id = 'branding' and public.is_admin());

create or replace function public.admin_set_branding(p_logo_url text default null, p_favicon_url text default null)
returns public.branding
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.branding;
begin
  if not public.is_admin() then raise exception 'Only administrators can update platform branding.'; end if;

  insert into public.branding(id, logo_url, favicon_url, updated_by, updated_at)
  values ('default', nullif(trim(p_logo_url),''), nullif(trim(p_favicon_url),''), auth.uid(), now())
  on conflict (id) do update set
    logo_url = excluded.logo_url,
    favicon_url = excluded.favicon_url,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.admin_set_branding(text, text) to authenticated;

commit;

-- Optional true background overdue automation:
-- If pg_cron is enabled in your Supabase project, schedule:
-- select cron.schedule('enigtee-refresh-invoice-overdue', '15 0 * * *', $$select public.refresh_invoice_overdue_statuses();$$);
-- Otherwise the application calls refresh_invoice_overdue_statuses() when the
-- admin/employer invoice workspace loads, which keeps the visible status current.
