# Supabase schema history

The production project contained 42 recorded migrations during the recovery on
2026-09-08. Every corresponding SQL file is stored in `migrations/`, followed by
reviewed migrations added through the normal development workflow.

Production's first recorded migration assumes that six public tables already
exist. Their schema predates the migration ledger and was recovered from the live
database in `baseline/legacy_foundation.sql`.

## Rebuilding an empty Supabase project

1. Create an empty Supabase project or local Supabase stack.
2. Apply `baseline/legacy_foundation.sql` once.
3. Apply every file in `migrations/` in filename order.
4. Create the administrator in Supabase Auth, then add that user's ID to
   `public.app_admins` through a trusted SQL or service-role context.
5. Load event content and guests separately. The repository deliberately contains
   no production guest list, private notes, admin ID, or private event content.

Never apply the baseline to the production project. Its objects already exist,
and keeping it outside `migrations/` prevents the Supabase CLI from treating it as
a pending production migration.

Run `npm test` to check the recovered migration inventory and content hashes.
