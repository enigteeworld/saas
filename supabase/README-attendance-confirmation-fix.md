# Attendance confirmation fix

Run `attendance-confirmation-fix.sql` after the production-stage patch.

This fixes the employee checkout -> employer review flow:

- Employer attendance queries are explicitly scoped to the employer's establishments.
- The employee checkout RPC sets the completed session back to `pending_confirmation` / `pending_review`.
- The employer receives an in-app attendance notification.
- The employer page uses the establishment IDs it already loaded instead of issuing a second nested establishment query that could produce an empty `.in(...)` filter.
