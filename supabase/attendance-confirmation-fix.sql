-- ============================================================================
-- ATTENDANCE VISIBILITY / CHECKOUT CONFIRMATION FIX
-- Run after production-stage-final-patch.sql.
--
-- Fixes:
--   * employer attendance requests are explicitly readable for their own
--     establishments, independent of the original base-policy name
--   * employee checkout returns the session to pending_confirmation so the
--     employer sees the completed session and can verify it
--   * employer receives an in-app notification when an employee checks out
-- ============================================================================

begin;

alter table public.attendance_events enable row level security;

drop policy if exists "employer attendance access" on public.attendance_events;
create policy "employer attendance access"
on public.attendance_events
for select
using (
  public.is_admin()
  or employee_id = auth.uid()
  or exists (
    select 1
    from public.establishments e
    join public.employer_profiles ep on ep.id = e.employer_id
    where e.id = attendance_events.establishment_id
      and ep.user_id = auth.uid()
  )
);

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
  v_employer_user uuid;
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
  set
    check_out_at = now(),
    confirmation_status = 'pending_confirmation',
    status = 'pending_review',
    confirmed_by = null,
    confirmed_at = null
  where id = v_row.id
  returning * into v_row;

  select ep.user_id
  into v_employer_user
  from public.employer_profiles ep
  where ep.id = v_deployment.employer_id;

  if v_employer_user is not null then
    perform public.notify_user(
      v_employer_user,
      'attendance',
      'Attendance checkout awaiting confirmation',
      'An employee has checked out. Review and confirm the attendance session from Workforce attendance.',
      '/employer/attendance'
    );
  end if;

  return v_row;
end;
$$;

grant execute on function public.employee_attendance_checkout(text) to authenticated;

commit;
