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
