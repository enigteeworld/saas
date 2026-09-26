-- ============================================================================
-- ENIGTEEWORLD EMPLOYER PROFILE VISIBILITY REPAIR
-- Run this in Supabase SQL Editor if Employer > Employees shows
-- "Address: Not provided" / "State / LGA: Not provided" even though the
-- employee completed onboarding.
--
-- This keeps bank_name, account_number and account_name private while exposing
-- only the contact/profile fields the employer needs for a deployed employee.
-- ============================================================================

begin;

alter table public.staff_profiles
  add column if not exists country text default 'Nigeria';

alter table public.staff_profiles
  add column if not exists bank_name text;

alter table public.staff_profiles
  add column if not exists account_number text;

alter table public.staff_profiles
  add column if not exists account_name text;

-- Employers must not read staff_profiles directly because the same row contains
-- payout/bank information.
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
  select
    d.employee_id,
    (public.is_admin() or public.owns_deployment_employer(d.id))
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
  select
    p.id,
    p.full_name,
    p.email,
    p.phone,
    sp.address,
    sp.state,
    sp.lga,
    sp.country
  from public.profiles p
  left join public.staff_profiles sp on sp.user_id = p.id
  where p.id = v_employee_id;
end;
$$;

grant execute on function public.get_employer_employee_profile(uuid) to authenticated;

commit;

-- Optional verification after the patch:
-- select * from public.get_employer_employee_profile('<DEPLOYMENT_UUID>');
