-- EnigteeWorld employee profile and payout fields
alter table public.staff_profiles add column if not exists country text default 'Nigeria';
alter table public.staff_profiles add column if not exists bank_name text;
alter table public.staff_profiles add column if not exists account_number text;
alter table public.staff_profiles add column if not exists account_name text;
