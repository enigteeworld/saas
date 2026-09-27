# EnigteeWorld production-stage final patch

Run:

`production-stage-final-patch.sql`

after the existing EnigteeWorld schema, workflow, attendance/payroll/invoice
patches and the production hardening/profile visibility patches.

This patch is intended to be idempotent and covers:

- payroll status compatibility
- QR regeneration without `gen_random_bytes(integer)` in the RPC
- dedicated employee QR checkout
- automatic present/late classification from the approved schedule
- full-period-only EnigteeWorld platform fee
- overdue invoice status refresh
- invoice credit notes
- employer invoice disputes and admin resolution
- branding table and Supabase branding storage
- payment calculations that respect credit notes

For overdue status, the application refreshes invoice status when the Admin or
Employer invoice workspace loads. If Supabase pg_cron is enabled, the optional
cron statement at the bottom of the SQL file can be scheduled for true daily
background processing.

## Platform fee rule

The monthly platform fee is not charged when an employee/deployment starts
late or leaves before the payroll period ends. The salary calculation and the
platform fee are separate: the employee can still have a payroll/salary line,
while the EnigteeWorld fee is omitted for an incomplete period.

## Branding

After running this SQL, use Admin -> Settings -> Platform branding to upload
the logo and favicon. The uploads go to the public `branding` storage bucket,
and the database stores the active URLs.
