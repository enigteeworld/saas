-- ============================================================================
-- EnigteeWorld PRODUCTION HARDENING PATCH
-- Run after the EnigteeWorld schema + employee-profile/workflow +
-- attendance/payroll/invoice patches. Idempotent.
--
-- Fixes:
--   * payroll_runs rejecting the 'calculating' lifecycle state
--   * employer exposure of employee bank/payout details
--   * safe employer employee-profile access through a security-definer RPC
--   * production onboarding columns used by the employee UI
-- ============================================================================

begin;

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

alter table public.staff_profiles add column if not exists country text default 'Nigeria';
alter table public.staff_profiles add column if not exists field_of_study text;
alter table public.staff_profiles add column if not exists preferred_location text;
alter table public.staff_profiles add column if not exists bank_name text;
alter table public.staff_profiles add column if not exists account_number text;
alter table public.staff_profiles add column if not exists account_name text;

-- Remove the employer's direct row access because that row contains payout data.
drop policy if exists "employer sees deployed staff profiles" on public.staff_profiles;

create or replace function public.get_employer_employee_profile(p_deployment_id uuid)
returns table (
  employee_id uuid,
  full_name text,
  email text,
  phone text,
  address text,
  state text,
  lga text,
  country text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_allowed boolean;
begin
  select d.employee_id, (public.is_admin() or public.owns_deployment_employer(d.id))
    into v_employee_id, v_allowed
  from public.deployments d
  where d.id = p_deployment_id;

  if v_employee_id is null then
    raise exception 'Deployment not found.';
  end if;

  if not coalesce(v_allowed, false) then
    raise exception 'You do not have access to this employee.';
  end if;

  return query
  select p.id, p.full_name, p.email, p.phone, sp.address, sp.state, sp.lga, sp.country
  from public.profiles p
  left join public.staff_profiles sp on sp.user_id = p.id
  where p.id = v_employee_id;
end;
$$;

grant execute on function public.get_employer_employee_profile(uuid) to authenticated;

commit;
