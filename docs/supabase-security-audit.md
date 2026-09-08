# Supabase security audit — 2026-09-08

The Supabase security advisor reported 54 findings in five groups. Each group was
checked against production definitions, grants and application call sites.

## Corrected findings

- The legacy Beer Pong and Iceberg `updated_at` trigger functions had no fixed
  `search_path`. Both now use an empty path and cannot be called by API roles.
- `photo_hunt_identity_name` was an internal helper but retained Supabase's
  explicit default grants for `anon` and `authenticated`. Those grants are now
  revoked, while privileged Photo Hunt functions can still use the helper.
- Chat, extras and Photo Hunt now share the central identity validity rule.
- Changing a guest from `confirmed` to any other status revokes the guest and
  plus-one sessions, matching deletion and global disconnection behavior.

## Intentional findings

- The 21 tables with RLS and no policy have no direct `PUBLIC`, `anon` or
  `authenticated` table privileges. They are private implementation tables
  reached only through narrow RPCs. Adding permissive policies would weaken this
  boundary.
- Guest-facing `SECURITY DEFINER` RPCs are intentionally callable by anonymous
  visitors. Mutations validate the application's UUID session token; public read
  RPCs expose only approved photos, scores or end-of-party aggregates.
- Administrator `SECURITY DEFINER` RPCs are granted only to `authenticated` and
  verify `auth.uid()` against `app_admins` before privileged work.

## Dashboard setting

Leaked-password protection remains an advisor warning. It is an Auth dashboard
setting available on Supabase Pro and above, rather than a database migration.
Enable it under Authentication, Sign In / Providers, Email when the project plan
supports it.
