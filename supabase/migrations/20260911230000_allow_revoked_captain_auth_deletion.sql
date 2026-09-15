-- Keep accepted invitation history without preventing deletion of a revoked
-- captain's Supabase Auth account.
alter table public.party_captain_invites
  drop constraint if exists party_captain_invites_accepted_by_fkey;

alter table public.party_captain_invites
  add constraint party_captain_invites_accepted_by_fkey
  foreign key (accepted_by)
  references auth.users(id)
  on delete set null;
