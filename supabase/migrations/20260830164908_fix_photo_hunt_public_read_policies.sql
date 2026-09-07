drop policy if exists "Read Photo Hunt challenges" on public.photo_hunt_challenges;
drop policy if exists "Read approved Photo Hunt submissions" on public.photo_hunt_submissions;

create policy "Public read active Photo Hunt challenges"
on public.photo_hunt_challenges
for select
to anon, authenticated
using (is_active = true);

create policy "Admins read all Photo Hunt challenges"
on public.photo_hunt_challenges
for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

create policy "Public read approved Photo Hunt submissions"
on public.photo_hunt_submissions
for select
to anon, authenticated
using (status = 'approved');

create policy "Admins read all Photo Hunt submissions"
on public.photo_hunt_submissions
for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);
