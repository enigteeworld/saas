# EnigteeWorld document upload patch

The project now uses the private `employee-documents` Supabase Storage bucket.

Run:

1. `supabase/document-upload-patch.sql` in the EnigteeWorld Supabase SQL Editor.
2. Confirm the bucket is named exactly `employee-documents` and is private.
3. The application expects candidate application files at:
   `<employee-id>/<application-id>/<document-kind>/<unique-file-name>`

Application documents are recorded in `public.application_documents`.

The frontend no longer uploads a generic onboarding file that is disconnected from an application. CVs and application letters are uploaded from the job application flow and linked to that application.

The updated admin and employer pages no longer import `src/lib/demoData.ts`; the demo data file has been removed.
