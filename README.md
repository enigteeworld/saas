# EnigteeWorld — Stage 2 (separate pages)

Recruitment and workforce management platform: public careers site, authentication, and three
role-based workspaces (employee, employer, HR admin).

## Running locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in your Supabase credentials. Production data is stored in
Supabase; the app does not use a local demo-data mode.

## Project structure

```
src/
├── App.tsx                     # Router + auth bootstrap
├── pages/
│   ├── public/                 # Home, About, How it works, Jobs, Job details, Employers, Contact
│   ├── auth/                   # Login, Register, Forgot password, Verify email
│   ├── employee/               # 11 job-seeker / employee workspace pages
│   ├── employer/               # 10 employer workspace pages
│   └── admin/                  # 16 HR administration pages
├── components/
│   ├── layouts/                # PublicLayout, EmployeeLayout, EmployerLayout, AdminLayout
│   ├── shared/                 # PageHeader, StatCard, EmptyState, StatusBadge, DataTable
│   └── ui/                     # shadcn/ui primitives
├── routes/
│   ├── AppRoutes.tsx           # Every route in the app
│   ├── RoleRoute.tsx           # Auth + role guard
│   └── routeConfig.ts          # Path constants and per-role sidebar navigation
├── stores/                     # zustand auth store (Supabase + demo mode)
├── lib/                        # Supabase client, storage, payroll, attendance, invoices, utils
├── hooks/
├── types/
└── utils/
```

Every page is its own file with a default export, so pages can be swapped, code-split or
converted to lazy routes without touching the rest of the app.

## Routes

| Area | Paths |
| --- | --- |
| Public | `/`, `/about`, `/how-it-works`, `/jobs`, `/jobs/:id`, `/employers`, `/contact` |
| Auth | `/login`, `/register`, `/forgot-password`, `/verify-email` |
| Employee | `/employee/dashboard`, `onboarding`, `profile`, `applications`, `applications/:id`, `interviews`, `documents`, `employment`, `attendance`, `payroll`, `notifications` |
| Employer | `/employer/dashboard`, `profile`, `establishments`, `jobs`, `candidates`, `employees`, `employees/:id`, `attendance`, `invoices`, `notifications` |
| Admin | `/admin/dashboard`, `jobs`, `jobs/new`, `applications`, `applications/:id`, `interviews`, `candidates`, `employers`, `establishments`, `employees`, `deployments`, `attendance`, `payroll`, `invoices`, `documents`, `settings` |

## Workflow patch (recruitment → employment → employer workforce)

This build wires the full lifecycle described in the project brief: every status
change now notifies the right person on their dashboard **and** by email, interview
scheduling carries real details to the employee's dashboard, HR can push documents
to employees, and a successful hire converts into a deployment that the employer
portal picks up automatically.

**To apply it to your Supabase project, run these SQL files in order** (SQL Editor):

1. `supabase/enigtee-world-schema.sql` (if not already applied)
2. `supabase/document-upload-patch.sql` (if not already applied)
3. `supabase/employee-profile-patch.sql` (if not already applied)
4. **`supabase/workflow-patch.sql`** ← new, idempotent, safe to re-run

Then deploy the new edge function so queued emails actually send:

```bash
supabase functions deploy send-notification-emails
supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FROM="EnigteeWorld <no-reply@yourdomain.com>" APP_URL=https://yourapp.com
```

No Resend key yet? Everything still works — notifications land on dashboards
immediately, and emails simply queue in `email_outbox` until the key is set.

### What changed
- **Notifications**: every workflow event (application status, interview scheduled/
  cancelled/outcome, document sent, employment status change, employer staffing
  request) now inserts a row in `notifications` via database triggers, so the bell
  icon and each portal's Notifications page finally populate. Realtime is enabled
  on that table so the bell badge updates live.
- **Emails**: the same triggers queue an email in `email_outbox`. The
  `send-notification-emails` edge function (Resend) delivers the queue; the
  frontend calls it right after any action that would notify someone.
- **Interview scheduling**: `interviews` gained `mode`, `location`,
  `duration_minutes`. Admin's application page has a real scheduling form; the
  details appear on the employee's dashboard notice board, Interviews page and
  Application details page, plus the email.
- **HR → employee documents**: `AdminDocumentsPage` has a "push a document to
  employees" panel (bulk, multi-select), and the application details page can send
  a document to one candidate. Employees see it on their Documents page with a
  download button and can upload a completed copy back.
- **Hire → deployment**: the application details page has an "Employment &
  deployment" panel that calls the new `admin_assign_deployment` RPC. It creates/
  updates the `deployments` row, which the employer's Employees/Dashboard pages
  already queried — so the employee now actually appears there, with attendance/
  payroll/invoices built on top of that same deployment.
- **Employer establishments**: every employer now always has a default
  establishment (auto-created on employer creation and back-filled for existing
  employers). The employer's "Request more staff" form preselects it automatically,
  and `EmployerEstablishmentsPage` finally has an "Add establishment" button.
  Job openings created by admin also preselect the employer's default
  establishment.
- **Employer staffing requests reach admin**: submitting a request notifies every
  admin (dashboard + email) and shows up flagged on `AdminJobsPage`, with
  Publish/Close actions.

## Attendance, payroll, invoicing & profile pictures (this build)

Implements the "Attendance, Payroll & Invoice Rules" planning spec end to end,
plus self-service profile pictures and full-detail job requests from employers.

**Run these SQL files in order** (SQL Editor), after everything already listed above:

1. `supabase/attendance-payroll-invoice-patch.sql` - all new tables, RPCs, RLS
2. `supabase/avatars-storage-patch.sql` - creates the **`avatars`** storage bucket
   (public, 3 MB limit, JPG/PNG/WEBP) and its policies. No manual bucket
   creation needed - this file does it.

No new edge function or dependency setup beyond `npm install` (adds `qrcode`,
used to render the QR image for attendance points - decoding just uses the
phone's native camera app, no camera-permission code in the app itself).

### How attendance works
- Admin or an employer creates an **attendance point** for one of their
  establishments (Admin → Attendance, or Employer → Attendance). Each point
  gets an opaque 10-character code and a QR image that encodes
  `<your-app-url>/employee/attendance?code=<code>`.
- Employees scan it with their phone's own camera app (no in-app scanner) -
  it opens the app already signed in, pre-fills the code, and one tap checks
  them in; scanning again checks them out. They can also just type the code
  if they can't scan.
- Every check-in starts `pending_confirmation`. The employer (or admin)
  confirms or rejects it from the attendance page; only confirmed attendance
  is used in payroll.
- Employers can also record a **manual check-in** (phone/battery/network
  issues) with a required reason - it's confirmed immediately and fully
  audited (`source`, `created_by`, `confirmed_by`). Manual entries more than
  2 days old are flagged for admin review instead of auto-confirming.

### How payroll works
- Admin → Payroll → "Calculate payroll" for a period (optionally scoped to
  one employer). It reads each active deployment's own `pay_basis` and
  `agreed_salary` (never the original job-opening salary), sums confirmed
  attendance for the period, and folds in any **approved** payroll
  adjustments (overtime/allowance/bonus add, deduction subtracts).
- Employers can propose an adjustment (not yet wired to a dedicated UI card
  in this pass - `propose_payroll_adjustment` RPC is ready in
  `lib/payroll.ts`; add a small form on the employer employee-details page
  when you're ready to expose it) which needs admin approval before it's
  used.
- "Approve & lock" freezes the run - a trigger blocks any further edits to
  its `payroll_items` for non-admins.

### How invoicing works
- From an approved payroll run, Admin → Payroll → "Generate invoices"
  creates one **draft** invoice per employer, itemised: one salary line and
  one platform-fee line per deployment.
- The platform fee defaults to **₦15,000** per active deployment
  (Admin → Invoices → "Platform fee" to change the default, disable it, or
  set an effective date). A specific employer or deployment can override it
  (`employer_profiles.billing_fee_override`,
  `deployments.billing_fee_override` / `billing_fee_enabled`).
- Admin issues the draft invoice; the employer is notified and can view the
  itemised breakdown and submit a payment (reference + amount + date).
  Admin confirms the payment before the invoice status changes to
  `partially_paid`/`paid` - a payment is never auto-applied just because a
  button was clicked.

### Profile pictures
- Employee, employer and admin profile pages each have a self-service
  "Profile photo" uploader (`components/shared/AvatarUpload.tsx`), writing
  to the existing `profiles.avatar_url` column and the new `avatars`
  storage bucket. The photo also now shows in the sidebar of all three
  portals.

### Job requests now carry full detail
- The employer's "Request more staff" form captures the same fields Admin
  uses to create a job (employment type, positions, salary range,
  responsibilities, requirements, qualifications, deadline) - not just a
  title and free-text requirements.
- Admin → Jobs now has a **"Review & edit"** link on every pending employer
  request, opening the same create-job form pre-filled for editing before
  publishing. "Quick publish" is still there for requests that need no
  changes.

## Branding

Place your own `logo.png` and `favicon.png` in `public/`, or set `VITE_LOGO_URL` and `VITE_FAVICON_URL` in `.env`. The app uses the image logo when available and falls back to the text mark if the logo cannot load.

## Round 3: check-in/out reliability, work schedules, payout account, password reset

Run **`supabase/attendance-payroll-invoice-fix.sql` again** (it's grown - safe
to re-run, each block is idempotent) and, new this round, **`supabase/payment-receipts-storage-patch.sql`**
(creates a private `payment-receipts` bucket, same pattern as `employee-documents`).

### What changed
- **Attendance check-in/out bug** - a second scan was creating a duplicate check-in
  instead of closing the first one out. Root cause: the "is there an open session"
  lookup only matched *today's* date, and the database's server-side "today" can
  disagree with Africa/Lagos around midnight. Fixed by matching on "any open
  session for this deployment" regardless of date, which is also just more
  correct (it now closes out a forgotten check-out from a prior day too).
- **Employee's own Attendance tab showing nothing** - a real bug: the deployment
  lookup sorted candidates alphabetically by status (`.order('status', {ascending:false})`),
  which does *not* actually prioritise `'active'` - if an employee ever has more
  than one qualifying deployment row, it could silently pick the wrong one and
  then query attendance for a deployment that has none. Fixed to explicitly
  prefer `'active'`.
- **Auto present/late detection** - confirming a QR check-in now compares the
  check-in time against the deployment's active work schedule (if one is set)
  and classifies it present or late automatically; the reviewer can still type
  an explicit override.
- **Work schedules** - new shared `WorkScheduleEditor` component. Employers set
  it from an employee's detail page (their own establishments); admin can set
  it too (`AdminEmployeeDetailsPage`), for when the employer discloses the
  schedule to admin instead of entering it themselves. The employee sees it
  read-only on their Attendance page. Every save is versioned (closes the old
  row, inserts a new one) so it never rewrites historical payroll.
- **Platform fee: full month only** - the fee line on an invoice is now only
  added for a deployment that covered the *entire* payroll period (no
  mid-period start, no mid-period departure). Someone who leaves before the
  month is up still gets billed for salary earned, just not the platform fee.
- **Company payout account** - Admin → Settings has a new "Company payout
  account" card (bank name / account number / account name / instructions).
  It's shown to the employer right on the Invoices page next to the "Submit a
  payment" form.
- **Payment receipts** - the employer's payment form now has an optional file
  upload (image or PDF); admin sees a "View receipt" link on each submitted
  payment (`payment-receipts` bucket, private, signed URLs only).
- **Password reset was actually broken** - `resetPasswordForEmail` had no
  `redirectTo`, and there was no page anywhere to complete a reset after
  clicking the email link. Added `ResetPasswordPage` at `/reset-password` and
  wired the redirect. **You must also add `<your-app-url>/reset-password` to
  Supabase → Authentication → URL Configuration → Redirect URLs**, or Supabase
  will reject the custom redirect and fall back to the default Site URL.

## Production data policy

The production build is Supabase-first. Application, employee, employer, attendance,
payroll and invoice records are read from Supabase; do not seed demo records or use
localStorage as a production data source.

## Production-stage final patch

After the existing schema, workflow, attendance/payroll/invoice and profile-visibility
patches, run:

`supabase/production-stage-final-patch.sql`

This adds the production fixes for QR checkout, QR regeneration, automatic late
classification, full-period-only platform fees, invoice overdue refresh, credit notes,
invoice disputes and platform branding.

Branding is managed from **Admin → Settings → Platform branding**. Upload the logo and
favicon there; they are stored in Supabase and applied across the public site and workspaces.

For local development:

```bash
npm install
npm run dev
```
